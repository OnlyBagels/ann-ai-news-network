"""Which beat a story belongs to, and so which reporter writes it.

WaterSheep picks one of the eight beats from the title and source text.
When it isn't sure, the source's usual beat (set in the Source table) wins.
With neither, the reporter's own call stands.
"""

from __future__ import annotations

import asyncio
from typing import Optional

from ann_agents.core.types import AgentRole, Story
from ann_agents.ingestion.article_text import source_text
from ann_agents.llm.watersheep import watersheep

# How WaterSheep sees each beat, and the category id it maps to.
BEATS = {
    "AI models and APIs": "models",
    "open source AI": "open_source",
    "AI coding tools": "coding_ai",
    "AI agents": "agents",
    "AI research papers": "research",
    "AI security": "security",
    "AI funding and business": "funding",
    "AI policy and regulation": "regulation",
}
QUESTION = "Which beat does this AI news story belong to?"
MIN_CONFIDENCE = 0.35

# The reporter agent that runs for each beat.
REPORTER_ROLE = {
    "models": AgentRole.MODEL_REPORTER,
    "coding_ai": AgentRole.MODEL_REPORTER,
    "agents": AgentRole.MODEL_REPORTER,
    "open_source": AgentRole.OPEN_SOURCE_REPORTER,
    "research": AgentRole.RESEARCH_REPORTER,
    "security": AgentRole.SECURITY_REPORTER,
    "funding": AgentRole.BUSINESS_REPORTER,
    "regulation": AgentRole.REGULATION_REPORTER,
}


async def assign_beat(story: Story) -> Optional[str]:
    source = story.primary_source
    hint = source.metadata.get("category_hint") if source else None
    if hint not in REPORTER_ROLE:
        hint = None
    ws = watersheep()
    if ws is not None:
        text = f"{story.title}\n{source_text(source)[:1500] if source else ''}"
        answer = await asyncio.to_thread(ws.ask, text, QUESTION, list(BEATS))
        if answer.confidence >= MIN_CONFIDENCE or not hint:
            return BEATS[answer.answer]
    return hint
