"""Regulation Reporter Agent - Tracks AI legislation, lawsuits, policy changes."""

from __future__ import annotations

from ann_agents.collaboration.team_chat import format_team_context_block
from ann_agents.core.base_agent import BaseAgent
from ann_agents.core.types import AgentRole, Category, Story, parse_category
from ann_agents.core.voice import apply_voice
from ann_agents.llm.router import LLMTier, llm_router


SYSTEM_PROMPT = """You are the Regulation Reporter for ANN (AI News Network).
Your beat: AI legislation, lawsuits, government regulation, policy changes,
compliance updates, risk analysis, regulatory frameworks.

For each regulation/policy story, extract:
1. What regulation/policy/legal action occurred
2. Jurisdiction (EU, US, China, etc.)
3. Impact on AI companies and developers
4. Timeline and enforcement details
5. Compliance requirements
6. Industry reaction

Output a JSON object with: title, summary, tags[], category, jurisdiction,
impact_level (low/medium/high), key_deadlines[]"""


class RegulationReporter(BaseAgent):
    """Reporter specializing in AI regulation and policy tracking."""

    def __init__(self):
        super().__init__(AgentRole.REGULATION_REPORTER)

    async def process(self, story: Story) -> Story:
        """Analyze a story from the regulation perspective."""
        source_text = self._build_source_text(story)

        result = await llm_router.complete(
            tier=LLMTier.PREMIUM,  # Legal/regulatory needs high accuracy
            system_prompt=apply_voice(SYSTEM_PROMPT),
            user_prompt=f"Analyze this AI regulation story:\n\n{source_text}",
            response_format={"type": "json_object"},
        )

        if result:
            import json
            try:
                data = json.loads(result)
                story.summary = data.get("summary", story.summary)
                story.tags = list(set(story.tags + data.get("tags", [])))
                cat = parse_category(data.get("category"))
                if cat:
                    story.category = cat
            except json.JSONDecodeError:
                story.summary = result[:500]

        story.category = story.category or Category.REGULATION
        return story

    def _build_source_text(self, story: Story) -> str:
        """Build text from source items for LLM analysis."""
        parts = [f"Title: {story.title}"]
        if story.primary_source:
            src = story.primary_source
            parts.append(f"Source: {src.source_name}")
            parts.append(f"URL: {src.url}")
            if src.content:
                parts.append(f"Content: {self._truncate(src.content)}")
            if src.summary:
                parts.append(f"Summary: {src.summary}")
        context = format_team_context_block(story, "reporters")
        if context:
            parts.append(context)
        return "\n".join(parts)
