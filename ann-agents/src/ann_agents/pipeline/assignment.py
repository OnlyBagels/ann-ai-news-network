"""Deciding which incoming items become stories.

Two passes over each cycle's new items:

1. WaterSheep screens every item (title and opening text) with one question,
   "is this about AI?", and drops the ones below WATERSHEEP_MIN_RELEVANCE.
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

RELEVANCE_QUESTION = "Is this about artificial intelligence or machine learning?"
_TAGS = re.compile(r"<[^>]+>")

EDITOR_SYSTEM = """You are the assignment editor at ANN, a newsroom covering artificial intelligence for builders, researchers and founders.
From the numbered list of incoming items, pick the ones most worth reporting today: launches, releases, research results, security issues, funding, policy.
Skip duplicates of the same news (keep the most direct source), adverts, job posts, and items with nothing new.
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
    asked = [i for i in todo if i.source_name not in trusted]
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
    shortlist = list(items[: settings.newsroom_shortlist])
    listing = "\n".join(f"{n}. [{i.source_name}] {i.title}" for n, i in enumerate(shortlist, 1))
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
    chosen = [shortlist[n - 1] for n in picks[:limit]]
    logger.info(f"[assignment] editor picked {len(chosen)} of {len(shortlist)}")
    return chosen


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
