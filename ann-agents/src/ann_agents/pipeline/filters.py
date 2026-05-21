"""Pre-pipeline filters — keep junk out of the agent pipeline.

The full 16-agent pipeline costs ~80 LLM calls per story. Cheap LLM
filters at the front save tokens and reviewer attention. A 1980 Knuth
typography paper has no business burning 16 agent invocations.
"""

from __future__ import annotations

import json
from typing import List

from loguru import logger

from ann_agents.core.types import SourceItem
from ann_agents.core.voice import apply_voice
from ann_agents.llm.router import LLMTier, llm_router


_FILTER_PROMPT = """\
You filter incoming stories for ANN (All News Network). Keep a story if
it is substantive news in any beat, including:
- World affairs, geopolitics, conflict, diplomacy
- Politics, elections, government, legislation, regulation
- Business, economics, markets, corporate news, mergers
- Technology, software, hardware, AI, cybersecurity
- Science, research papers, breakthroughs, space
- Climate, environment, energy, natural disasters
- Health, medicine, public health, pharma
- Sports: major events, results, transfers, controversies
- Culture, entertainment, film, music, books, notable events

Reject only:
- Pure SEO listicles or promotional content with no real story
- Spam, aggregator roundups with no original reporting
- Personal blog posts or opinion pieces unrelated to a news event
- Press releases dressed up as news with no independent angle

You get a numbered list. Return a JSON object with two arrays of indices:
{"kept": [int, ...], "rejected": [int, ...]}

Every input index must appear in exactly one array. When in doubt, keep
the story — it is better to over-include than to drop a real story.
"""


async def filter_newsworthy(items: List[SourceItem]) -> List[SourceItem]:
    """Return the subset of items judged newsworthy by the LLM.

    One batched LLM call regardless of input size. On failure, passes
    every item through unchanged — better to over-process than to
    silently drop a real story because of a parser error.
    """
    if not items:
        return items

    listing_lines: List[str] = []
    for i, it in enumerate(items):
        snippet = (it.summary or "")[:160].replace("\n", " ").strip()
        line = f"{i}. {it.title} ({it.source_name})"
        if snippet:
            line += f" — {snippet}"
        listing_lines.append(line)
    listing = "\n".join(listing_lines)

    result = await llm_router.complete(
        tier=LLMTier.CHEAP,
        system_prompt=apply_voice(_FILTER_PROMPT),
        user_prompt=f"Stories:\n\n{listing}",
        response_format={"type": "json_object"},
        max_tokens=1500,
    )
    if not result:
        logger.warning(
            f"[filter] llm returned None; passing all {len(items)} items through"
        )
        return items

    try:
        data = json.loads(result)
        kept_idx = set(data.get("kept", []))
        kept = [it for i, it in enumerate(items) if i in kept_idx]
        rejected_count = len(items) - len(kept)
        logger.info(
            f"[filter] kept {len(kept)}/{len(items)} as newsworthy "
            f"(rejected {rejected_count})"
        )
        return kept
    except json.JSONDecodeError as e:
        logger.error(
            f"[filter] failed to parse llm response: {e}; passing all through"
        )
        return items


async def filter_ai_relevant(items: List[SourceItem]) -> List[SourceItem]:
    """Deprecated alias for filter_newsworthy. Use filter_newsworthy instead."""
    logger.warning(
        "[filter] filter_ai_relevant is deprecated; call filter_newsworthy instead"
    )
    return await filter_newsworthy(items)
