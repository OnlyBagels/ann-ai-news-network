"""Research Agent - Gathers supporting information and enriches stories."""

from __future__ import annotations

from ann_agents.core.base_agent import BaseAgent
from ann_agents.core.types import AgentRole, Story
from ann_agents.llm.router import LLMTier, llm_router


SYSTEM_PROMPT = """You are a Research Agent for ANN (AI News Network).
Your job: enrich stories by gathering supporting context.

For each story, you should:
1. Identify key claims, entities, and references
2. Suggest related articles and prior coverage
3. Find official documentation and primary sources
4. Gather benchmark history and context
5. Collect API pricing data if relevant
6. Retrieve historical context (prior announcements, comparisons)

Output a JSON object with: supporting_links[], related_topics[], historical_context,
key_entities[], official_sources[], benchmark_data (optional)"""


class ResearchAgent(BaseAgent):
    """Agent that enriches stories with supporting research and context."""

    def __init__(self):
        super().__init__(AgentRole.RESEARCH_AGENT)

    async def process(self, story: Story) -> Story:
        """Research and enrich a story with supporting information."""
        source_text = self._build_source_text(story)

        result = await llm_router.complete(
            tier=LLMTier.LONG_CONTEXT,  # Needs to analyze full context
            system_prompt=SYSTEM_PROMPT,
            user_prompt=f"Research and enrich this story with supporting context:\n\n{source_text}",
            response_format={"type": "json_object"},
        )

        if result:
            import json
            try:
                data = json.loads(result)
                # Store research findings in the story metadata
                if story.primary_source:
                    story.primary_source.metadata["research"] = data
                story.sources_analyzed = len(data.get("supporting_links", [])) + 1
            except json.JSONDecodeError:
                pass

        return story

    def _build_source_text(self, story: Story) -> str:
        """Build comprehensive text from all source items."""
        parts = [f"Title: {story.title}"]
        if story.summary:
            parts.append(f"Summary: {story.summary}")

        for i, src in enumerate(story.source_items):
            parts.append(f"\n--- Source {i + 1}: {src.source_name} ---")
            parts.append(f"URL: {src.url}")
            if src.author:
                parts.append(f"Author: {src.author}")
            if src.content:
                parts.append(f"Content: {self._truncate(src.content, max_chars=5000)}")
            if src.summary:
                parts.append(f"Summary: {src.summary}")

        return "\n".join(parts)
