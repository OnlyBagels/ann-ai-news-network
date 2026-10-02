"""Beat Reporter - writes the general news sections (world, politics, sports...)."""

from __future__ import annotations

import json

from ann_agents.core.base_agent import BaseAgent
from ann_agents.core.types import AgentRole, Story
from ann_agents.llm.router import LLMTier, llm_router
from ann_agents.reporters.persona import persona_note
from ann_agents.reporters.rules import ARTICLE_RULES, sources_block

SECTIONS = {
    "world": "international news: conflicts, diplomacy, elections and disasters outside the US",
    "us": "national US news: courts, states and cities, crime, disasters, immigration, education",
    "politics": "US and world politics: legislatures, the executive, campaigns, elections and policy",
    "business": "business and the economy: companies, earnings, jobs, trade, markets",
    "crypto": "crypto, tokens, NFTs and collectibles markets",
    "tech": "technology: consumer tech, platforms, gadgets and tech companies",
    "science": "science and space: research findings, missions, discoveries",
    "climate": "climate and the environment: weather extremes, emissions, energy, conservation",
    "health": "health and medicine: research, public health, drugs, health policy",
    "sports": "sports: results, players, teams and leagues",
    "entertainment": "entertainment: film, TV, music, celebrities and the entertainment business",
    "gaming": "video games: releases, studios, platforms and the game industry",
    "internet": "internet culture: online trends, creators, platforms and what people are talking about",
}

SYSTEM_PROMPT = """You are a reporter for ANN, a general news network written by AI and checked against its sources.
Your beat is {beat}. Readers come from across the political spectrum and trust ANN because it reports what happened, who said what, and nothing else."""


class BeatReporter(BaseAgent):
    """Writes a full article for whatever general section the story was assigned."""

    def __init__(self):
        super().__init__(AgentRole.BEAT_REPORTER)

    async def process(self, story: Story) -> Story:
        section = story.category.value if story.category else "us"
        beat = SECTIONS.get(section, "general news")
        result = await llm_router.complete(
            tier=LLMTier.CHEAP,
            system_prompt=SYSTEM_PROMPT.format(beat=beat) + ARTICLE_RULES,
            user_prompt=f"Write the article from these sources:\n\n{sources_block(story)}{persona_note(story)}",
            response_format={"type": "json_object"},
        )
        if result:
            try:
                data = json.loads(result)
                story.summary = data.get("summary") or story.summary
                story.content = data.get("body") or story.content
                story.tags = list(set(story.tags + [t for t in data.get("tags", []) if isinstance(t, str)]))
                if data.get("headline"):
                    story.suggested_headlines = list({*story.suggested_headlines, data["headline"]})
            except json.JSONDecodeError:
                story.summary = result[:500]
        return story
