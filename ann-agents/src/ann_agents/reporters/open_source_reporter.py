"""Open Source Reporter Agent - Tracks GitHub, HuggingFace, OSS ecosystem."""

from __future__ import annotations

from ann_agents.core.base_agent import BaseAgent
from ann_agents.core.types import AgentRole, Category, Story, parse_category
from ann_agents.core.voice import apply_voice
from ann_agents.llm.router import LLMTier, llm_router


SYSTEM_PROMPT = """You are the Open Source Reporter for ANN (AI News Network).
Your beat: GitHub trending repos, HuggingFace models/datasets, OSS AI tooling,
local inference tools, agent frameworks, developer ecosystems.

For each story, extract:
1. What repo/tool/project is featured
2. What it does (technical description)
3. Why it matters (innovation, adoption, uniqueness)
4. GitHub stats (stars, forks, language) if available
5. Developer impact and use cases

Output a JSON object with: title, summary, tags[], category, key_points[], github_url (optional)"""


class OpenSourceReporter(BaseAgent):
    """Reporter specializing in open-source AI ecosystem tracking."""

    def __init__(self):
        super().__init__(AgentRole.OPEN_SOURCE_REPORTER)

    async def process(self, story: Story) -> Story:
        """Analyze a story from the open-source perspective."""
        source_text = self._build_source_text(story)

        result = await llm_router.complete(
            tier=LLMTier.CHEAP,
            system_prompt=apply_voice(SYSTEM_PROMPT),
            user_prompt=f"Analyze this open-source AI story:\n\n{source_text}",
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

        story.category = story.category or Category.OPEN_SOURCE
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
            if src.metadata:
                parts.append(f"Metadata: {src.metadata}")
        return "\n".join(parts)
