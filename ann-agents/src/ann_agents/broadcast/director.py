"""The director keeps the one shared timeline topped up.

Each tick it checks whether anyone is watching, how much is already queued,
and what show the grid says is on. Then it books the next segment: a show
open at the top of a slot, otherwise the next story, written by Claude when
the budget allows and read straight from the article when it doesn't.
Segments are appended end to end, so every viewer sees the same thing at
the same moment.
"""

from __future__ import annotations

import asyncio
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, List, Optional, Set, Union
from zoneinfo import ZoneInfo

from loguru import logger

from ann_agents.broadcast import lineup as grid
from ann_agents.broadcast.budget import Spend, can_spend
from ann_agents.broadcast.facts import build_fact_sheet, render_fact_sheet
from ann_agents.llm.watersheep import Ask
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
from ann_agents.broadcast.standards import apply_rules, check_line, segment_survives, tidy_line
from ann_agents.broadcast.store import BroadcastStore
from ann_agents.broadcast.timing import lay_out
from ann_agents.broadcast.tts import NoVoice, Voice
from ann_agents.broadcast.writer import ClaudeNewsroom, DeskResult, LocalNewsroom, SplitNewsroom
from ann_agents.datadesk.scripts import markets_lines, sports_lines, weather_lines

LEAD = timedelta(seconds=2)  # never book a segment to start in the past
IDENT_WINDOW = timedelta(minutes=10)  # a show open only airs near the top of its slot
FEATURE_SCORE = 80  # stories at or above this score get the bigger writer model
INFLIGHT_ESTIMATE = timedelta(seconds=30)
LINE_QUESTION = "Is the statement supported by the facts?"  # airtime a script being written will likely fill


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
    set: Optional[str] = None
    board: Optional[dict] = None


class Director:
    def __init__(
        self,
        store: BroadcastStore,
        lineup: Lineup,
        newsroom: Optional[Union[ClaudeNewsroom, LocalNewsroom, SplitNewsroom]],
        voice: Voice = NoVoice(),
        daily_budget_usd: float = 5.0,
        viewer_window_seconds: int = 180,
        lookahead_seconds: int = 150,
        cooldown_hours: int = 6,
        desk_review: bool = True,
        write_timeout_seconds: float = 180.0,
        min_runway_seconds: int = 0,
        watersheep: Any = None,
        min_support: float = 0.5,
        always_on: bool = False,
        data_desk: Any = None,
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
        self.write_timeout = write_timeout_seconds
        # WaterSheep votes on every line that states a fact, after the rules
        # and before the language model's desk review.
        self.watersheep = watersheep
        self.min_support = min_support
        self.min_runway = timedelta(seconds=min_runway_seconds)
        self.always_on = always_on
        # Weather, scores and prices for the data hits (datadesk.boards.DataDesk).
        self.data = data_desk
        self._data_pending: Set[str] = set()
        # Several ticks can run at once (one per model server). These keep
        # them from writing the same story, opening a show twice, or booking
        # into the same slot.
        self._inflight_ids: Set[str] = set()
        self._writing = 0
        self._ident_pending = False
        self._book_lock = asyncio.Lock()

    async def tick(self, now: Optional[datetime] = None) -> TickResult:
        """One pass. Pass `now` to run against a fixed clock (tests, replays)."""
        fixed = now is not None
        now = now or datetime.now(timezone.utc)
        if not self.always_on and self.store.active_viewers(now, self.viewer_window) == 0:
            return TickResult("idle", note="no one is watching")

        start = self._next_start(now)
        queued = start - now
        if queued + self._writing * INFLIGHT_ESTIMATE >= self.lookahead:
            return TickResult("full", note=f"queued until {start:%H:%M:%S}, {self._writing} being written")

        show = grid.show_at(self.lineup, start)
        slot_began = grid.slot_start(self.lineup, start)
        clock = None if fixed else (lambda: datetime.now(timezone.utc))

        if (
            start - slot_began < IDENT_WINDOW
            and not self._ident_pending
            and not self.store.ident_aired_since(slot_began)
        ):
            self._ident_pending = True
            try:
                draft = self._ident(show)
                segment = await self._book(draft, show, now, clock)
            finally:
                self._ident_pending = False
        elif (hit := self._data_hit(show, start)) and (board := await self.data.board(hit)) and (
            draft := self._data(hit, board, show)
        ):
            self._data_pending.add(hit)
            try:
                segment = await self._book(draft, show, now, clock)
            finally:
                self._data_pending.discard(hit)
        elif (question := self._question_due(now)) is not None:
            draft = self._question(question, show)
            segment = await self._book(draft, show, now, clock)
            self.store.mark_question_aired(question["id"], segment.id)
        else:
            story = self._pick_story(show, now)
            if story is None:
                return TickResult("empty", note="no approved stories to air")
            # Short on runway: air the article as written now rather than
            # leave dead air while a slow model writes.
            write = self.newsroom is not None and queued >= self.min_runway
            self._inflight_ids.add(story.id)
            self._writing += 1 if write else 0
            try:
                draft = await self._story(story, show, now, write=write)
                segment = await self._book(draft, show, now, clock)
            finally:
                self._inflight_ids.discard(story.id)
                self._writing -= 1 if write else 0

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
        busy = self._inflight_ids
        for categories in (show.categories, []):
            stories = self.store.candidate_stories(categories, aired_since=since, limit=1 + len(busy))
            stories = [s for s in stories if s.id not in busy]
            if stories:
                return stories[0]
        return (
            self.store.least_recently_aired(show.categories, exclude=busy)
            or self.store.least_recently_aired([], exclude=busy)
        )

    # When in the hour each data hit airs (Eastern minutes), for shows that carry it.
    DATA_WINDOWS = {"weather": (0, 12), "sports": (15, 25), "markets": (30, 40)}

    def _data_hit(self, show: Show, start: datetime) -> Optional[str]:
        """Which data hit, if any, is due at `start` and hasn't aired this hour."""
        if self.data is None:
            return None
        local = start.astimezone(ZoneInfo(self.lineup.timezone))
        for kind, (lo, hi) in self.DATA_WINDOWS.items():
            if not getattr(show, kind) or kind in self._data_pending or not (lo <= local.minute < hi):
                continue
            since = local.replace(minute=lo, second=0, microsecond=0).astimezone(timezone.utc)
            if not self.store.kind_aired_since(kind, since):
                return kind
        return None

    def _data(self, kind: str, board: dict, show: Show) -> Optional[Draft]:
        """A data hit read off the board by its regular presenter."""
        cast = {a.id for a in self.lineup.anchors}
        if kind == "weather":
            desk = ["skye"] if "skye" in cast else show.anchors[:1]
            lines = weather_lines(board, desk[0])
            title = "Weather now"
        elif kind == "sports":
            desk = show.anchors if show.sports and show.set == "sports" else (["kofi"] if "kofi" in cast else []) + show.anchors[:1]
            lines = sports_lines(board, desk)
            title = "Scoreboard"
        else:
            desk = ["nora"] if "nora" in cast else show.anchors[:1]
            lines = markets_lines(board, desk[0])
            title = "Crypto prices"
        if not lines:
            return None
        return Draft(kind=kind, title=title, anchors=desk, lines=lines, articles=[], writer="data",
                     spend=Spend(), dropped=[], set=kind, board=board)

    QUESTION_GAP = timedelta(minutes=20)

    def _question_due(self, now: datetime) -> Optional[dict]:
        """An answered viewer question, if none has aired in the last 20 minutes."""
        if self.store.kind_aired_since("question", now - self.QUESTION_GAP):
            return None
        return self.store.next_answered_question()

    def _question(self, q: dict, show: Show) -> Draft:
        """A viewer's question, read with their handle, and the desk's checked answer."""
        a = show.anchors[0]
        b = show.anchors[1] if len(show.anchors) > 1 else a
        sentences = [x.strip() for x in re.split(r"(?<=[.!?])\s+", q["answer"]) if x.strip()]
        halves = [" ".join(sentences[: (len(sentences) + 1) // 2]), " ".join(sentences[(len(sentences) + 1) // 2 :])]
        lines = [ScriptLine(speaker=a, text=f"A question from a viewer, {q['handle']}: {q['text']}", mood="neutral")]
        lines += [ScriptLine(speaker=b, text=h, mood="neutral") for h in halves if h]
        lines.append(ScriptLine(speaker=a, text="Send the desk your questions on our website.", mood="happy"))
        articles = [SegmentArticle(id=st["id"], title=st["title"], source=st["source"], url=st["url"]) for st in q["stories"]]
        return Draft(kind="question", title="Viewer question", anchors=[a] if a == b else [a, b], lines=lines,
                     articles=articles, writer="desk", spend=Spend(), dropped=[])

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

    async def _story(self, story: StoryInput, show: Show, now: datetime, write: bool = True) -> Draft:
        facts = build_fact_sheet(story)
        article = SegmentArticle(id=story.id, title=story.title, source=story.source, url=story.url)
        desk = list(show.anchors)
        spend = Spend()
        dropped: List[DroppedLine] = []

        spent_today = self.store.spent_on(now.strftime("%Y-%m-%d"))
        written = None
        if write and self.newsroom and can_spend(spent_today, self.daily_budget_usd):
            try:
                written = await asyncio.wait_for(
                    self.newsroom.write(
                        story, facts, show, desk, self.lineup, self.store.last_line(), now,
                        feature=story.overall_score >= FEATURE_SCORE,
                    ),
                    self.write_timeout,
                )
            except asyncio.TimeoutError:
                logger.warning(f"[broadcast] script for '{story.title[:50]}' took over {self.write_timeout:.0f}s")
        if written is not None:
            spend = spend + written.spend
            if written.script is not None:
                names = {i: grid.anchor(self.lineup, i).name for i in desk}
                drafted = [tidy_line(line, names) for line in written.script.lines]
                rules = apply_rules(drafted, facts, desk, now)
                dropped.extend(rules.dropped)
                kept = rules.kept

                if self.watersheep is not None and kept:
                    doubted = await self._watersheep_doubts(facts, kept)
                    for i, reason in doubted.items():
                        line = kept[i]
                        dropped.append(DroppedLine(speaker=line.speaker, text=line.text, reason=reason, stage="watersheep"))
                    kept = [line for i, line in enumerate(kept) if i not in doubted]

                if self.desk_review and kept:
                    try:
                        review = await asyncio.wait_for(self.newsroom.review(facts, kept), self.write_timeout)
                    except asyncio.TimeoutError:
                        review = DeskResult(unsupported={}, spend=Spend(), ok=False)
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
                        lines=[ScriptLine(speaker=l.speaker, text=l.text, mood=l.mood, fact_ids=l.fact_ids) for l in kept],
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

    async def _watersheep_doubts(self, facts, lines: List[DraftLine]) -> dict:
        """Lines that state a fact and that WaterSheep doesn't find in the fact sheet."""
        sheet = render_fact_sheet(facts)
        claims = [i for i, line in enumerate(lines) if line.fact_ids]
        if not claims:
            return {}
        asks = [Ask(f"Facts:\n{sheet}\n\nStatement: {lines[i].text}", LINE_QUESTION) for i in claims]
        try:
            answers = await asyncio.to_thread(self.watersheep.ask_many, asks)
        except Exception as e:
            logger.error(f"[broadcast] WaterSheep check failed: {e}")
            return {i: "WaterSheep could not check this line" for i in claims}
        return {
            i: f"WaterSheep gives {a.p_yes:.2f} that the facts support it"
            for i, a in zip(claims, answers)
            if a.p_yes < self.min_support
        }

    async def _book(self, draft: Draft, show: Show, now: datetime, clock=None) -> Segment:
        """Voice the lines, then append the segment to the end of the timeline."""
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

        async with self._book_lock:
            # Re-read the queue: other ticks may have booked while this one wrote.
            start = self._next_start(clock() if clock else now)
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
                set=draft.set,
                board=draft.board,
            )
            self.store.insert_segment(segment, draft.writer, draft.spend.usd, draft.dropped)
        return segment


def _title(preferred: str, fallback: str, limit: int = 90) -> str:
    title = (preferred or fallback).strip()
    if len(title) <= limit:
        return title
    cut = title[: limit - 3].rsplit(" ", 1)[0]
    return f"{cut}..."
