"""The director keeps the one shared timeline topped up.

Each tick it checks whether anyone is watching, how much is already queued,
and what show the grid says is on. Then it books the next segment: a show
open at the top of a slot, otherwise the next story, written by Claude when
the budget allows and read straight from the article when it doesn't.
Segments are appended end to end, so every viewer sees the same thing at
the same moment.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Sequence

from loguru import logger

from ann_agents.broadcast import lineup as grid
from ann_agents.broadcast.budget import Spend, can_spend
from ann_agents.broadcast.facts import build_fact_sheet
from ann_agents.broadcast.models import (
    DraftLine,
    DroppedLine,
    Lineup,
    ScriptLine,
    Segment,
    SegmentArticle,
    Show,
    StoryInput,
)
from ann_agents.broadcast.reel import headline_read, show_open
from ann_agents.broadcast.standards import apply_rules, check_line, segment_survives
from ann_agents.broadcast.store import BroadcastStore
from ann_agents.broadcast.timing import lay_out
from ann_agents.broadcast.tts import NoVoice, Voice
from ann_agents.broadcast.writer import ClaudeNewsroom

LEAD = timedelta(seconds=2)  # never book a segment to start in the past
IDENT_WINDOW = timedelta(minutes=10)  # a show open only airs near the top of its slot
FEATURE_SCORE = 80  # stories at or above this score get the bigger writer model


@dataclass
class TickResult:
    action: str  # idle | full | booked | empty
    segment: Optional[Segment] = None
    writer: Optional[str] = None
    note: str = ""


@dataclass
class Draft:
    kind: str
    title: str
    anchors: List[str]
    lines: List[ScriptLine]
    articles: List[SegmentArticle]
    writer: str
    spend: Spend
    dropped: List[DroppedLine]


class Director:
    def __init__(
        self,
        store: BroadcastStore,
        lineup: Lineup,
        newsroom: Optional[ClaudeNewsroom],
        voice: Voice = NoVoice(),
        daily_budget_usd: float = 5.0,
        viewer_window_seconds: int = 180,
        lookahead_seconds: int = 150,
        cooldown_hours: int = 6,
        desk_review: bool = True,
    ):
        self.store = store
        self.lineup = lineup
        self.newsroom = newsroom
        self.voice = voice
        self.daily_budget_usd = daily_budget_usd
        self.viewer_window = viewer_window_seconds
        self.lookahead = timedelta(seconds=lookahead_seconds)
        self.cooldown = timedelta(hours=cooldown_hours)
        self.desk_review = desk_review

    async def tick(self, now: Optional[datetime] = None) -> TickResult:
        """One pass. Pass `now` to run against a fixed clock (tests, replays)."""
        fixed = now is not None
        now = now or datetime.now(timezone.utc)
        if self.store.active_viewers(now, self.viewer_window) == 0:
            return TickResult("idle", note="no one is watching")

        start = self._next_start(now)
        if start - now >= self.lookahead:
            return TickResult("full", note=f"queued until {start:%H:%M:%S}")

        show = grid.show_at(self.lineup, start)
        slot_began = grid.slot_start(self.lineup, start)

        if start - slot_began < IDENT_WINDOW and not self.store.ident_aired_since(slot_began):
            draft = self._ident(show)
        else:
            story = self._pick_story(show, now)
            if story is None:
                return TickResult("empty", note="no approved stories to air")
            draft = await self._story(story, show, now)

        # Writing takes time; re-read the queue so segments never overlap.
        after = now if fixed else datetime.now(timezone.utc)
        segment = await self._book(draft, show, self._next_start(after))
        self.store.record_spend(now.strftime("%Y-%m-%d"), draft.spend)
        logger.info(
            f"[broadcast] booked {segment.kind} '{segment.title[:50]}' on {show.name} "
            f"at {segment.starts_at:%H:%M:%S} ({segment.duration_ms / 1000:.1f}s, {draft.writer}, "
            f"${draft.spend.usd:.4f}, {len(draft.dropped)} line(s) cut)"
        )
        return TickResult("booked", segment=segment, writer=draft.writer)

    def _next_start(self, now: datetime) -> datetime:
        end = self.store.queue_end()
        earliest = now + LEAD
        return end if end and end > earliest else earliest

    def _pick_story(self, show: Show, now: datetime) -> Optional[StoryInput]:
        since = now - self.cooldown
        for categories in (show.categories, []):
            stories = self.store.candidate_stories(categories, aired_since=since, limit=1)
            if stories:
                return stories[0]
        return self.store.least_recently_aired(show.categories) or self.store.least_recently_aired([])

    def _ident(self, show: Show) -> Draft:
        anchors = [grid.anchor(self.lineup, a) for a in show.anchors]
        return Draft(
            kind="ident",
            title=show.name,
            anchors=list(show.anchors),
            lines=show_open(show, anchors, self.lineup.network),
            articles=[],
            writer="reel",
            spend=Spend(),
            dropped=[],
        )

    async def _story(self, story: StoryInput, show: Show, now: datetime) -> Draft:
        facts = build_fact_sheet(story)
        article = SegmentArticle(id=story.id, title=story.title, source=story.source, url=story.url)
        desk = list(show.anchors)
        spend = Spend()
        dropped: List[DroppedLine] = []

        spent_today = self.store.spent_on(now.strftime("%Y-%m-%d"))
        if self.newsroom and can_spend(spent_today, self.daily_budget_usd):
            written = await self.newsroom.write(
                story, facts, show, desk, self.lineup, self.store.last_line(), now,
                feature=story.overall_score >= FEATURE_SCORE,
            )
            spend = spend + written.spend
            if written.script is not None:
                drafted = written.script.lines
                rules = apply_rules(drafted, facts, desk, now)
                dropped.extend(rules.dropped)
                kept = rules.kept

                if self.desk_review and kept:
                    review = await self.newsroom.review(facts, kept)
                    spend = spend + review.spend
                    if not review.ok:
                        kept = []
                        dropped.append(DroppedLine(
                            speaker="-", text="(whole script)", reason="standards review did not complete", stage="desk",
                        ))
                    else:
                        for i in sorted(review.unsupported):
                            line = kept[i]
                            dropped.append(DroppedLine(
                                speaker=line.speaker, text=line.text, reason=review.unsupported[i], stage="desk",
                            ))
                        kept = [line for i, line in enumerate(kept) if i not in review.unsupported]

                # The lower third is on air too, so it meets the same rules.
                title = written.script.title
                title_line = DraftLine(speaker=desk[0], text=title, fact_ids=[f.id for f in facts])
                if check_line(title_line, {f.id: f for f in facts}, set(desk), (now.year,)):
                    title = story.title

                problem = segment_survives(len(drafted), kept)
                if problem is None:
                    return Draft(
                        kind="story",
                        title=_title(title, story.title),
                        anchors=desk,
                        lines=[ScriptLine(speaker=l.speaker, text=l.text, fact_ids=l.fact_ids) for l in kept],
                        articles=[article],
                        writer=written.model,
                        spend=spend,
                        dropped=dropped,
                    )
                logger.warning(f"[broadcast] script for '{story.title[:50]}' pulled: {problem}")

        host = desk[0]
        return Draft(
            kind="reel",
            title=_title(story.title, story.title),
            anchors=[host],
            lines=headline_read(story, facts, host),
            articles=[article],
            writer="reel",
            spend=spend,
            dropped=dropped,
        )

    async def _book(self, draft: Draft, show: Show, start: datetime) -> Segment:
        segment_id = uuid.uuid4().hex[:16]
        measured: List[Optional[int]] = []
        for i, line in enumerate(draft.lines):
            voice_id = grid.anchor(self.lineup, line.speaker).voice
            clip = await self.voice.speak(line.text, voice_id, f"{segment_id}-{i}")
            if clip:
                line.audio = clip.file
                line.mouth = clip.mouth
            measured.append(clip.duration_ms if clip else None)
        duration = lay_out(draft.lines, measured)

        segment = Segment(
            id=segment_id,
            show_id=show.id,
            kind=draft.kind,  # type: ignore[arg-type]
            starts_at=start,
            duration_ms=duration,
            title=draft.title,
            anchors=draft.anchors,
            articles=draft.articles,
            lines=draft.lines,
        )
        self.store.insert_segment(segment, draft.writer, draft.spend.usd, draft.dropped)
        return segment


def _title(preferred: str, fallback: str, limit: int = 60) -> str:
    title = (preferred or fallback).strip()
    if len(title) <= limit:
        return title
    cut = title[: limit - 3].rsplit(" ", 1)[0]
    return f"{cut}..."
