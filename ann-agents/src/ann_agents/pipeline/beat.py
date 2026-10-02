"""Which section a story belongs to, and so which reporter writes it.

WaterSheep picks the section from the headline and source text. AI stories
then get one of the AI beats. When WaterSheep isn't sure, the source's usual
section (the category on its Source row) wins. With neither, the reporter's
own call stands.
"""

from __future__ import annotations

import asyncio
from typing import Optional

from ann_agents.core.types import AI_CATEGORIES, AgentRole, Category, Story
from ann_agents.ingestion.article_text import source_text
from ann_agents.llm.watersheep import watersheep

# How WaterSheep sees each section, and the category id it maps to ("ai" is
# resolved to an AI beat with a second question).
SECTIONS = {
    "world news outside the United States": "world",
    "United States national news": "us",
    "politics and government": "politics",
    "business and the economy": "business",
    "crypto, NFTs and collectibles": "crypto",
    "technology and gadgets": "tech",
    "artificial intelligence": "ai",
    "science and space": "science",
    "climate and the environment": "climate",
    "health and medicine": "health",
    "sports": "sports",
    "film, TV, music and celebrities": "entertainment",
    "video games": "gaming",
    "internet culture and online trends": "internet",
}
SECTION_QUESTION = "Which section of a news site does this story belong in?"

AI_BEATS = {
    "AI models and APIs": "models",
    "open source AI": "open_source",
    "AI coding tools": "coding_ai",
    "AI agents": "agents",
    "AI research papers": "research",
    "AI security": "security",
    "AI funding and business": "funding",
    "AI policy and regulation": "regulation",
}
AI_QUESTION = "Which beat does this AI news story belong to?"

# Kept for callers that only know the AI beats.
BEATS = AI_BEATS
QUESTION = AI_QUESTION
MIN_CONFIDENCE = 0.35

# The reporter agent that runs for each category.
REPORTER_ROLE = {
    "models": AgentRole.MODEL_REPORTER,
    "coding_ai": AgentRole.MODEL_REPORTER,
    "agents": AgentRole.MODEL_REPORTER,
    "open_source": AgentRole.OPEN_SOURCE_REPORTER,
    "research": AgentRole.RESEARCH_REPORTER,
    "security": AgentRole.SECURITY_REPORTER,
    "funding": AgentRole.BUSINESS_REPORTER,
    "regulation": AgentRole.REGULATION_REPORTER,
    **{c.value: AgentRole.BEAT_REPORTER for c in Category if c.value not in AI_CATEGORIES},
}


async def assign_beat(story: Story) -> Optional[str]:
    source = story.primary_source
    hint = source.metadata.get("category_hint") if source else None
    if hint not in REPORTER_ROLE:
        hint = None
    ws = watersheep()
    if ws is None:
        return hint
    text = f"{story.title}\n{source_text(source)[:1500] if source else ''}"
    section = await asyncio.to_thread(ws.ask, text, SECTION_QUESTION, list(SECTIONS))
    if section.confidence < MIN_CONFIDENCE and hint:
        return hint
    picked = SECTIONS[section.answer]
    if picked != "ai":
        return picked
    if hint in AI_CATEGORIES:
        return hint
    beat = await asyncio.to_thread(ws.ask, text, AI_QUESTION, list(AI_BEATS))
    return AI_BEATS[beat.answer]
