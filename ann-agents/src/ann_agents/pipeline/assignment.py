"""Deciding which incoming items become stories.

Two passes over each cycle's new items:

1. WaterSheep screens every item (title and opening text) with one question,
   "is this a news report?", and drops ads, promotions, job posts and opinion
   columns below WATERSHEEP_MIN_RELEVANCE.
   It runs on CPU in a fraction of a second per item, so it can read the
   whole feed.
2. The language model (Gemma, or whatever the CHEAP tier resolves to) reads
   the shortlist as an assignment editor and picks the stories worth a
   newsroom slot this cycle.

Either pass is skipped when its model isn't available, falling back to the
newest items from each source in turn.
"""

from __future__ import annotations

import asyncio
import json
import re
from typing import List, Optional, Sequence, Set

from loguru import logger

from ann_agents.core.config import settings
from ann_agents.core.types import SourceItem
from ann_agents.ingestion.sources import ai_sources
from ann_agents.llm.router import LLMTier, llm_router
from ann_agents.llm.watersheep import Ask, watersheep
from ann_agents.pipeline.corroborate import coverage

RELEVANCE_QUESTION = "Is this a news report about real events, rather than an advertisement, a promotion, a job listing or an opinion column?"
_TAGS = re.compile(r"<[^>]+>")

EDITOR_SYSTEM = """You are the assignment editor at ANN, a general news network read across the political spectrum.
From the numbered list of incoming items, pick the ones most worth reporting now: events that affect many people, new information, and stories several outlets are covering. Each item shows its section, its outlet and how many other outlets are running the same story.
Keep a mix of sections: world, US, politics, business, crypto, tech, AI, science, climate, health, sports, entertainment, games and the internet. Don't pick by which side a story might help.
Skip duplicates of the same news (keep the most direct source), opinion columns, adverts, deals and shopping posts, horoscopes, quizzes, and items with nothing new.
Reply with JSON only: {"picks": [numbers]}, best first."""


def _preview(item: SourceItem, chars: int = 400) -> str:
    body = " ".join(_TAGS.sub(" ", item.summary or item.content or "").split())
    return f"{item.title}\n{body[:chars]}"


async def screen(items: Sequence[SourceItem], off_topic: Set[str]) -> List[SourceItem]:
    """Keep the items WaterSheep thinks are about AI; remember the rest by URL.

    Items from AI-only feeds pass without asking.
    """
    ws = watersheep()
    if ws is None:
        return list(items)
    trusted = ai_sources()
    todo = [i for i in items[: settings.newsroom_screen_max] if i.url not in off_topic]
    asked = [i for i in todo if not (i.metadata.get("ai_only") or i.source_name in trusted)]
    answers = await asyncio.to_thread(ws.ask_many, [Ask(_preview(i), RELEVANCE_QUESTION) for i in asked]) if asked else []
    verdict = {id(i): a for i, a in zip(asked, answers)}
    kept = []
    for item in todo:
        answer = verdict.get(id(item))
        if answer is None:
            kept.append(item)
            continue
        item.metadata["watersheep_relevance"] = round(answer.p_yes, 3)
        if answer.p_yes >= settings.watersheep_min_relevance:
            kept.append(item)
        else:
            off_topic.add(item.url)
    logger.info(f"[assignment] WaterSheep kept {len(kept)} of {len(todo)} items ({len(asked)} screened)")
    return kept


async def editor_pick(items: Sequence[SourceItem], limit: int) -> List[SourceItem]:
    """Ask the language model to choose up to `limit` stories from the shortlist."""
    if len(items) <= limit or not settings.newsroom_editor_pick:
        return list(items[:limit])
    # Bigger stories first: the ones the most outlets are running.
    covered = coverage(items)
    ranked = sorted(items, key=lambda i: -covered.get(i.url, 0))
    shortlist = list(ranked[: settings.newsroom_shortlist])

    def line(n: int, i: SourceItem) -> str:
        section = i.metadata.get("category_hint") or "general"
        others = covered.get(i.url, 0)
        also = f" (also covered by {others} other outlets)" if others else ""
        return f"{n}. [{section}] [{i.source_name}] {i.title}{also}"

    listing = "\n".join(line(n, i) for n, i in enumerate(shortlist, 1))
    reply = await llm_router.complete(
        tier=LLMTier.CHEAP,
        system_prompt=EDITOR_SYSTEM,
        user_prompt=f"Pick up to {limit}.\n\n{listing}",
        max_tokens=300,
        temperature=0.2,
        response_format={"type": "json_object"},
    )
    picks = _parse_picks(reply, len(shortlist))
    if not picks:
        logger.warning("[assignment] the editor's pick was unusable; taking the newest items")
        return shortlist[:limit]
    chosen = with_section_mix([shortlist[n - 1] for n in picks], limit)
    logger.info(f"[assignment] editor picked {len(chosen)} of {len(shortlist)}")
    return chosen


def with_section_mix(picks: Sequence[SourceItem], limit: int) -> List[SourceItem]:
    """Keep the editor's order, but no section takes more than a third of the slots."""
    cap = max(1, -(-limit // 3))
    per: dict = {}
    kept: List[SourceItem] = []
    for item in picks:
        section = item.metadata.get("category_hint")
        if section and per.get(section, 0) >= cap:
            continue
        if section:
            per[section] = per.get(section, 0) + 1
        kept.append(item)
        if len(kept) >= limit:
            break
    return kept


def _parse_picks(reply: Optional[str], size: int) -> List[int]:
    if not reply:
        return []
    try:
        raw = json.loads(reply).get("picks", [])
    except (json.JSONDecodeError, AttributeError):
        return []
    picks: List[int] = []
    for value in raw:
        try:
            n = int(value)
        except (TypeError, ValueError):
            continue
        if 1 <= n <= size and n not in picks:
            picks.append(n)
    return picks


async def assign(items: Sequence[SourceItem], limit: int, off_topic: Set[str]) -> List[SourceItem]:
    return await editor_pick(await screen(items, off_topic), limit)
