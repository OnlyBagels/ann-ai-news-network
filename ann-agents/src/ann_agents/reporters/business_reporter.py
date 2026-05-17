"""Business Reporter Agent - Tracks funding, acquisitions, startup launches, enterprise AI."""

from __future__ import annotations

from ann_agents.core.base_agent import BaseAgent
from ann_agents.core.types import AgentRole, Category, Story
from ann_agents.core.voice import apply_voice
from ann_agents.llm.router import LLMTier, llm_router


SYSTEM_PROMPT = """You are the Business Reporter for ANN (AI News Network).
Your beat: funding rounds, acquisitions, startup launches, enterprise AI adoption,
market intelligence, company tracking, industry trends, partnerships.

For each business story, extract:
1. What company/deal/event occurred
2. Financial details (amount, valuation, round type)
3. Key players involved
4. Market significance
5. Competitive landscape impact
6. Enterprise relevance

Output a JSON object with: title, summary, tags[], category, company_name,
funding_amount (optional), round_type (optional), key_players[]"""


class BusinessReporter(BaseAgent):
    """Reporter specializing in AI business and market tracking."""

    def __init__(self):
        super().__init__(AgentRole.BUSINESS_REPORTER)

    async def process(self, story: Story) -> Story:
        """Analyze a story from the business perspective."""
        source_text = self._build_source_text(story)

        result = await llm_router.complete(
            tier=LLMTier.CHEAP,
            system_prompt=apply_voice(SYSTEM_PROMPT),
            user_prompt=f"Analyze this AI business story:\n\n{source_text}",
            response_format={"type": "json_object"},
        )

        if result:
            import json
            try:
                data = json.loads(result)
                story.summary = data.get("summary", story.summary)
                story.tags = list(set(story.tags + data.get("tags", [])))
                if data.get("category"):
                    story.category = Category(data["category"])
            except json.JSONDecodeError:
                story.summary = result[:500]

        story.category = story.category or Category.FUNDING
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
        return "\n".join(parts)
