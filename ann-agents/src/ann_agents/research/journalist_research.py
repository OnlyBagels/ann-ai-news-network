"""JournalistResearcher — runs three researchers in parallel and combines.

Spawns three independent researchers, each using one tool, on the same
Story. Each returns a few paragraphs of notes. The orchestrator stitches
them into a single research dossier and stashes it on the story's
primary_source metadata so ArticleWriter can pick it up.

Pattern from HKUDS Auto-Deep-Research / STORM / GPT Researcher: parallel
multi-perspective research → synthesis → write. Lighter than those
frameworks because the article length is 4-6 paragraphs of news, not a
multi-page report.
"""

from __future__ import annotations

import asyncio
from typing import List, Tuple

from loguru import logger

from ann_agents.core.base_agent import BaseAgent
from ann_agents.core.types import AgentRole, Story
from ann_agents.research.researchers import (
    CrossReferenceResearcher,
    EntityLookupResearcher,
    WebSearchResearcher,
)


DOSSIER_METADATA_KEY = "research_dossier"


class JournalistResearcher(BaseAgent):
    """Runs 3 researchers in parallel and attaches the combined dossier."""

    def __init__(self) -> None:
        super().__init__(AgentRole.JOURNALIST_RESEARCHER)
        self.researchers = [
            WebSearchResearcher(),
            CrossReferenceResearcher(),
            EntityLookupResearcher(),
        ]

    async def process(self, story: Story) -> Story:
        # Skip if we have nothing to research.
        if not story.title or not story.primary_source:
            return story

        tasks = [r.research(story) for r in self.researchers]
        results: List = await asyncio.gather(*tasks, return_exceptions=True)

        sections: List[Tuple[str, str]] = []
        for researcher, result in zip(self.researchers, results):
            if isinstance(result, Exception):
                logger.warning(f"[{researcher.name}] raised: {result}")
                continue
            if not isinstance(result, str) or not result.strip():
                continue
            sections.append((researcher.name, result.strip()))

        if not sections:
            logger.info("[journalist_researcher] no researcher returned notes")
            return story

        # Stitch into one markdown dossier. ArticleWriter reads this verbatim.
        dossier_parts = ["# Research Dossier", ""]
        for name, text in sections:
            heading = name.replace("_", " ").title()
            dossier_parts.append(f"## {heading}")
            dossier_parts.append(text)
            dossier_parts.append("")
        dossier = "\n".join(dossier_parts).strip()

        # Stash on the primary_source metadata — survives the story merge
        # in story_pipeline and is what ArticleWriter reads.
        story.primary_source.metadata[DOSSIER_METADATA_KEY] = dossier
        logger.info(
            f"[journalist_researcher] dossier: {len(sections)}/3 researchers, "
            f"{len(dossier)} chars"
        )
        return story
