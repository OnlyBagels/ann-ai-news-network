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

from ann_agents.collaboration.team_chat import append_team_round, get_team_context
from ann_agents.core.base_agent import BaseAgent
from ann_agents.core.config import settings
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

        rounds = max(1, settings.team_chat_rounds) if settings.team_chat_enabled else 1
        latest_sections: dict[str, str] = {}
        peer_context = get_team_context(story, "research")

        for round_idx in range(1, rounds + 1):
            tasks = [r.research(story, peer_context=peer_context) for r in self.researchers]
            results: List = await asyncio.gather(*tasks, return_exceptions=True)

            round_sections: List[Tuple[str, str]] = []
            round_notes: List[str] = []
            for researcher, result in zip(self.researchers, results):
                if isinstance(result, Exception):
                    logger.warning(f"[{researcher.name}] raised: {result}")
                    continue
                if not isinstance(result, str) or not result.strip():
                    continue
                note = result.strip()
                round_sections.append((researcher.name, note))
                latest_sections[researcher.name] = note
                round_notes.append(f"{researcher.name}: {note[:240].replace(chr(10), ' ')}")

            if round_notes:
                append_team_round(
                    story,
                    "research",
                    round_idx,
                    round_notes,
                    max_chars=settings.team_chat_context_chars,
                )
                peer_context = get_team_context(story, "research")
                logger.info(
                    f"[journalist_researcher] round {round_idx}/{rounds}: "
                    f"{len(round_sections)}/3 researcher notes"
                )

        sections = list(latest_sections.items())
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
