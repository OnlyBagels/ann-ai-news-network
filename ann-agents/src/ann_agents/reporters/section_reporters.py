"""Section desk reporters for full-newsroom coverage.

These reporters cover ANN's top-level sections (world, politics, business,
tech, science, climate, health, sports, culture, opinion). They can run
in parallel as a desk sweep so each story gets multi-beat scrutiny.
"""

from __future__ import annotations

import json
from typing import Dict

from ann_agents.collaboration.team_chat import format_team_context_block
from ann_agents.core.base_agent import BaseAgent
from ann_agents.core.personas import reporter_for_category, reporter_for_section
from ann_agents.core.types import AgentRole, Story, parse_category
from ann_agents.core.voice import apply_voice
from ann_agents.llm.router import LLMTier, llm_router


class SectionDeskReporter(BaseAgent):
    """Generic reporter that analyzes a story through one section lens."""

    def __init__(self, role: AgentRole, section: str, beat_description: str):
        super().__init__(role)
        self.section = section
        self.beat_description = beat_description

    async def process(self, story: Story) -> Story:
        persona = reporter_for_section(self.section)
        if persona is None:
            persona = reporter_for_category(story.category)

        system_prompt = apply_voice(
            f"""You are {persona.name}, {persona.role} at ANN.
You are filing a desk brief for the {self.section} desk.

DESK BEAT
{self.beat_description}

VOICE
{persona.personality}

TASK
Review the source material and extract what matters for your desk.
Return strict JSON with:
- summary: 2-3 sentence desk summary
- tags: array of 4-10 lowercase tags
- key_points: array of concrete facts worth carrying into the article
- angle: one sentence on why your desk thinks this matters now
- category: optional ANN tech category when relevant

RULES
- Ground every claim in the supplied source content.
- No hype language. No vague attribution.
- Keep key_points concrete (numbers, names, decisions, dates).
"""
        )

        result = await llm_router.complete(
            tier=LLMTier.CHEAP,
            system_prompt=system_prompt,
            user_prompt=self._build_source_text(story),
            response_format={"type": "json_object"},
            max_tokens=500,
        )

        if not result:
            return story

        try:
            data = json.loads(result)
        except json.JSONDecodeError:
            return story

        desk_summary = str(data.get("summary") or "").strip()
        if desk_summary:
            story.summary = desk_summary

        tags = data.get("tags")
        if isinstance(tags, list):
            normalized = [str(tag).strip().lower() for tag in tags if str(tag).strip()]
            story.tags = list(set(story.tags + normalized))

        # Only tech desk should set category hints.
        if self.section == "tech":
            cat = parse_category(data.get("category"))
            if cat:
                story.category = cat

        return story

    def _build_source_text(self, story: Story) -> str:
        src = story.primary_source
        parts = [
            f"TITLE: {story.title}",
            f"TRIAGED SECTION: {story.section or 'unknown'}",
            f"TRIAGED REGION: {story.region or 'global'}",
            f"TRIAGED COUNTRY: {story.country or 'global'}",
        ]
        if src:
            parts.append(f"SOURCE: {src.source_name}")
            parts.append(f"URL: {src.url}")
            if src.summary:
                parts.append(f"SOURCE SUMMARY:\n{src.summary}")
            if src.content:
                parts.append(f"SOURCE CONTENT:\n{self._truncate(src.content, max_chars=7000)}")
        context = format_team_context_block(story, "reporters")
        if context:
            parts.append(context)
        return "\n\n".join(parts)


def build_section_reporters() -> Dict[AgentRole, SectionDeskReporter]:
    """Create section-desk reporters keyed by AgentRole."""
    return {
        AgentRole.WORLD_REPORTER: SectionDeskReporter(
            AgentRole.WORLD_REPORTER,
            "world",
            "Geopolitics, diplomacy, conflicts, international institutions, cross-border impacts.",
        ),
        AgentRole.POLITICS_REPORTER: SectionDeskReporter(
            AgentRole.POLITICS_REPORTER,
            "politics",
            "Government decisions, elections, legislation, policy shifts, public accountability.",
        ),
        AgentRole.BUSINESS_DESK_REPORTER: SectionDeskReporter(
            AgentRole.BUSINESS_DESK_REPORTER,
            "business",
            "Markets, companies, labor, deal flow, financial impact, economic signals.",
        ),
        AgentRole.TECH_REPORTER: SectionDeskReporter(
            AgentRole.TECH_REPORTER,
            "tech",
            "Software, hardware, AI systems, developer tools, infrastructure, platform shifts.",
        ),
        AgentRole.SCIENCE_REPORTER: SectionDeskReporter(
            AgentRole.SCIENCE_REPORTER,
            "science",
            "Peer-reviewed findings, labs, methodology, evidence quality, replication signals.",
        ),
        AgentRole.CLIMATE_REPORTER: SectionDeskReporter(
            AgentRole.CLIMATE_REPORTER,
            "climate",
            "Climate policy, emissions, adaptation, energy transition, environmental risk.",
        ),
        AgentRole.HEALTH_REPORTER: SectionDeskReporter(
            AgentRole.HEALTH_REPORTER,
            "health",
            "Public health, medicine, clinical evidence, health systems, patient impact.",
        ),
        AgentRole.SPORTS_REPORTER: SectionDeskReporter(
            AgentRole.SPORTS_REPORTER,
            "sports",
            "Leagues, labor dynamics, athlete impact, competition outcomes, sports business.",
        ),
        AgentRole.CULTURE_REPORTER: SectionDeskReporter(
            AgentRole.CULTURE_REPORTER,
            "culture",
            "Media, arts, internet culture, audience behavior, social meaning.",
        ),
        AgentRole.OPINION_REPORTER: SectionDeskReporter(
            AgentRole.OPINION_REPORTER,
            "opinion",
            "Argument quality, framing assumptions, competing interpretations, civic stakes.",
        ),
    }
