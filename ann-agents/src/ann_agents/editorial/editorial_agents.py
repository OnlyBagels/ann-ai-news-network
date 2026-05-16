"""Editorial Agents - Refine and polish content for publication."""

from __future__ import annotations

from ann_agents.core.base_agent import BaseAgent
from ann_agents.core.types import AgentRole, SignalScores, Story
from ann_agents.llm.router import LLMTier, llm_router


class HeadlineEditor(BaseAgent):
    """Creates compelling, accurate headlines for stories."""

    def __init__(self):
        super().__init__(AgentRole.HEADLINE_EDITOR)

    async def process(self, story: Story) -> Story:
        """Generate headline options for a story."""
        source_text = f"Title: {story.title}\nSummary: {story.summary or 'N/A'}\nTags: {', '.join(story.tags)}"

        result = await llm_router.complete(
            tier=LLMTier.CHEAP,
            system_prompt="You are a headline editor for a technical AI news outlet. "
                          "Generate 3 concise, accurate, non-clickbait headline options. "
                          "Output a JSON object with: headlines[]",
            user_prompt=f"Generate headlines for this story:\n\n{source_text}",
            response_format={"type": "json_object"},
        )

        if result:
            import json
            try:
                data = json.loads(result)
                story.suggested_headlines = data.get("headlines", [])
                if story.suggested_headlines:
                    story.headline = story.suggested_headlines[0]
            except json.JSONDecodeError:
                pass

        return story


class TechnicalEditor(BaseAgent):
    """Ensures technical accuracy and clarity in stories."""

    def __init__(self):
        super().__init__(AgentRole.TECHNICAL_EDITOR)

    async def process(self, story: Story) -> Story:
        """Review and improve technical accuracy."""
        source_text = f"Title: {story.title}\nSummary: {story.summary or 'N/A'}\nContent: {self._truncate(story.content or 'N/A', max_chars=5000)}"

        result = await llm_router.complete(
            tier=LLMTier.PREMIUM,
            system_prompt="You are a technical editor for an AI news outlet. "
                          "Review the story for technical accuracy, clarity, and completeness. "
                          "Output a JSON object with: technical_issues[], clarity_score (0-10), "
                          "suggested_improvements[], is_technically_sound (bool)",
            user_prompt=f"Review this story for technical accuracy:\n\n{source_text}",
            response_format={"type": "json_object"},
        )

        if result:
            import json
            try:
                data = json.loads(result)
                if story.primary_source:
                    story.primary_source.metadata["technical_review"] = data
            except json.JSONDecodeError:
                pass

        return story


class StyleEditor(BaseAgent):
    """Maintains ANN's voice and style guidelines."""

    def __init__(self):
        super().__init__(AgentRole.STYLE_EDITOR)

    async def process(self, story: Story) -> Story:
        """Apply ANN style guidelines to the story."""
        source_text = f"Title: {story.title}\nSummary: {story.summary or 'N/A'}"

        result = await llm_router.complete(
            tier=LLMTier.CHEAP,
            system_prompt="You are a style editor for ANN (AI News Network). "
                          "ANN's style: technical, confident, concise, high-signal. "
                          "No hype, no clickbait, no influencer tone. "
                          "Output a JSON object with: style_issues[], tone_assessment, "
                          "readability_score (0-10), suggested_refinements[]",
            user_prompt=f"Review this story for ANN style compliance:\n\n{source_text}",
            response_format={"type": "json_object"},
        )

        if result:
            import json
            try:
                data = json.loads(result)
                if story.primary_source:
                    story.primary_source.metadata["style_review"] = data
            except json.JSONDecodeError:
                pass

        return story


class SummaryEditor(BaseAgent):
    """Creates concise TL;DRs and quick briefs."""

    def __init__(self):
        super().__init__(AgentRole.SUMMARY_EDITOR)

    async def process(self, story: Story) -> Story:
        """Generate TL;DR and improve summary."""
        source_text = f"Title: {story.title}\nContent: {self._truncate(story.content or story.summary or 'N/A', max_chars=4000)}"

        result = await llm_router.complete(
            tier=LLMTier.CHEAP,
            system_prompt="You are a summary editor. Create a concise TL;DR (1-2 sentences) "
                          "and a brief summary (2-3 paragraphs) for a technical AI audience. "
                          "Output a JSON object with: tl_dr, summary",
            user_prompt=f"Create TL;DR and summary for:\n\n{source_text}",
            response_format={"type": "json_object"},
        )

        if result:
            import json
            try:
                data = json.loads(result)
                story.tl_dr = data.get("tl_dr", story.tl_dr)
                story.summary = data.get("summary", story.summary)
            except json.JSONDecodeError:
                pass

        return story
