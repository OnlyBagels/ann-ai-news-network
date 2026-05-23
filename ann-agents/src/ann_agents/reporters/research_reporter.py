"""Research Reporter Agent - Tracks arXiv papers, benchmarks, conferences."""

from __future__ import annotations

from ann_agents.collaboration.team_chat import format_team_context_block
from ann_agents.core.base_agent import BaseAgent
from ann_agents.core.types import AgentRole, Category, Story, parse_category
from ann_agents.core.voice import apply_voice
from ann_agents.llm.router import LLMTier, llm_router


SYSTEM_PROMPT = """You are the Research Reporter for ANN (AI News Network).
Your beat: arXiv papers, AI research, benchmarks, conferences, architecture changes,
evaluation trends, breakthrough research.

For each paper/research story, extract:
1. Paper title and authors
2. Key contributions and findings
3. Architecture/methodology details
4. Benchmark results and comparisons
5. Practical implications
6. Relationship to prior work

Output a JSON object with: title, summary, tags[], category, key_points[], paper_url (optional), authors[]"""


class ResearchReporter(BaseAgent):
    """Reporter specializing in AI research and paper tracking."""

    def __init__(self):
        super().__init__(AgentRole.RESEARCH_REPORTER)

    async def process(self, story: Story) -> Story:
        """Analyze a story from the research perspective."""
        source_text = self._build_source_text(story)

        result = await llm_router.complete(
            tier=LLMTier.LONG_CONTEXT,  # Papers need longer context
            system_prompt=apply_voice(SYSTEM_PROMPT),
            user_prompt=f"Analyze this AI research story:\n\n{source_text}",
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

        story.category = story.category or Category.RESEARCH
        return story

    def _build_source_text(self, story: Story) -> str:
        """Build text from source items for LLM analysis."""
        parts = [f"Title: {story.title}"]
        if story.primary_source:
            src = story.primary_source
            parts.append(f"Source: {src.source_name}")
            parts.append(f"URL: {src.url}")
            if src.content:
                parts.append(f"Content: {self._truncate(src.content, max_chars=15000)}")
            if src.summary:
                parts.append(f"Summary: {src.summary}")
        context = format_team_context_block(story, "reporters")
        if context:
            parts.append(context)
        return "\n".join(parts)
