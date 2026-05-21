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
You filter incoming stories for ANN (AI News Network). A story is
AI-relevant if it covers any of:
- AI models, model releases, model behavior
- AI research papers, benchmarks, evaluations
- AI tools, frameworks, infrastructure, inference, training
- AI agents, coding agents, agentic systems
- AI security, jailbreaks, prompt injection, safety incidents
- AI regulation, lawsuits, policy
- AI company funding, acquisitions, market moves
- Developer tooling specifically for AI

Reject:
- Classic CS or non-AI software with no AI angle
- General tech news with no AI angle
- Personal blog posts, opinion pieces, unrelated culture
- Hardware unrelated to AI compute

You get a numbered list. Return a JSON object with two arrays of indices:
{"kept": [int, ...], "rejected": [int, ...]}

Every input index must appear in exactly one array. Be strict — reject
anything where the AI angle is speculative or absent from the title
and snippet.
"""


async def filter_ai_relevant(items: List[SourceItem]) -> List[SourceItem]:
    """Return the subset of items judged AI-relevant by the LLM.

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
            f"[filter] kept {len(kept)}/{len(items)} as AI-relevant "
            f"(rejected {rejected_count})"
        )
        return kept
    except json.JSONDecodeError as e:
        logger.error(
            f"[filter] failed to parse llm response: {e}; passing all through"
        )
        return items
