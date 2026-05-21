"""Oversight Agents - Governance, risk assessment, and quality control."""

from __future__ import annotations

from ann_agents.core.base_agent import BaseAgent
from ann_agents.core.types import (
    AgentRole,
    RiskAssessment,
    RiskLevel,
    SignalScores,
    Story,
    StoryStatus,
)
from ann_agents.llm.router import LLMTier, llm_router


class RiskAgent(BaseAgent):
    """Flags risky content: lawsuits, defamation, unverified leaks, dangerous info."""

    def __init__(self):
        super().__init__(AgentRole.RISK_AGENT)

    async def process(self, story: Story) -> Story:
        """Assess risk level of a story."""
        source_text = f"Title: {story.title}\nSummary: {story.summary or 'N/A'}\nContent: {self._truncate(story.content or 'N/A', max_chars=5000)}"

        result = await llm_router.complete(
            tier=LLMTier.PREMIUM,
            system_prompt="You are a risk assessment agent for an AI news outlet. "
                          "Flag potential risks: defamation, lawsuits, unverified leaks, "
                          "dangerous misinformation, security vulnerabilities that shouldn't be detailed. "
                          "Output a JSON object with: risk_level (low/medium/high), "
                          "risk_factors[], requires_human_review (bool), safety_flags[]",
            user_prompt=f"Assess risk for this story:\n\n{source_text}",
            response_format={"type": "json_object"},
        )

        if result:
            import json
            try:
                data = json.loads(result)
                if story.risk is None:
                    story.risk = RiskAssessment()
                story.risk.risk_level = RiskLevel(data.get("risk_level", "low"))
                story.risk.risk_factors = data.get("risk_factors", [])
                story.risk.requires_human_review = data.get("requires_human_review", False)
                story.risk.safety_flags = data.get("safety_flags", [])
            except json.JSONDecodeError:
                pass

        return story


class LegalAgent(BaseAgent):
    """Reviews copyright concerns, citation usage, legal exposure."""

    def __init__(self):
        super().__init__(AgentRole.LEGAL_AGENT)

    async def process(self, story: Story) -> Story:
        """Review legal aspects of a story."""
        source_text = f"Title: {story.title}\nSummary: {story.summary or 'N/A'}\nSources: {len(story.source_items)}"

        result = await llm_router.complete(
            tier=LLMTier.PREMIUM,
            system_prompt="You are a legal review agent for an AI news outlet. "
                          "Review for: copyright concerns, citation usage, legal exposure, "
                          "high-risk wording, fair use compliance. "
                          "Output a JSON object with: legal_concerns[], citation_quality (good/fair/poor), "
                          "requires_legal_review (bool), recommendations[]",
            user_prompt=f"Review legal aspects of this story:\n\n{source_text}",
            response_format={"type": "json_object"},
        )

        if result:
            import json
            try:
                data = json.loads(result)
                if story.risk is None:
                    story.risk = RiskAssessment()
                story.risk.legal_concerns = data.get("legal_concerns", [])
                if data.get("requires_legal_review", False):
                    story.risk.requires_human_review = True
            except json.JSONDecodeError:
                pass

        return story


class BiasAgent(BaseAgent):
    """Checks for sensationalism, source imbalance, unsupported framing."""

    def __init__(self):
        super().__init__(AgentRole.BIAS_AGENT)

    async def process(self, story: Story) -> Story:
        """Check for bias in the story."""
        source_text = f"Title: {story.title}\nSummary: {story.summary or 'N/A'}\nTags: {', '.join(story.tags)}"

        result = await llm_router.complete(
            tier=LLMTier.CHEAP,
            system_prompt="You are a bias detection agent. Check for: sensationalism, "
                          "source imbalance, unsupported framing, hype inflation, "
                          "missing counterpoints, emotional language. "
                          "Output a JSON object with: bias_concerns[], sensationalism_score (0-10), "
                          "source_balance (good/fair/poor), is_balanced (bool)",
            user_prompt=f"Check this story for bias:\n\n{source_text}",
            response_format={"type": "json_object"},
        )

        if result:
            import json
            try:
                data = json.loads(result)
                if story.risk is None:
                    story.risk = RiskAssessment()
                story.risk.bias_concerns = data.get("bias_concerns", [])
            except json.JSONDecodeError:
                pass

        return story


class EditorInChief(BaseAgent):
    """Highest-level AI oversight - determines publish readiness."""

    def __init__(self):
        super().__init__(AgentRole.EDITOR_IN_CHIEF)

    async def process(self, story: Story) -> Story:
        """Make final publish decision based on all agent outputs."""
        # Gather all signals
        confidence = story.confidence
        risk = story.risk
        has_agents = len(story.agents_involved) > 0

        # Every article goes through the human gate. The Editor-in-Chief
        # marks the story ready for review; a human at /admin/review is the
        # only thing that flips status to APPROVED. See CLAUDE.md "Don't
        # bypass the human gate" — there is no auto-publish path.
        _ = (risk, confidence, has_agents)  # signals already on the story
        story.status = StoryStatus.NEEDS_HUMAN_REVIEW

        # Calculate signal scores
        story.scores = self._calculate_scores(story)

        return story

    def _calculate_scores(self, story: Story) -> SignalScores:
        """Calculate ANN's proprietary signal scores."""
        scores = SignalScores()

        # Base score from confidence
        if story.confidence:
            base = int(story.confidence.overall_confidence * 100)
            scores.signal_score = base
            scores.hype_score = int(story.confidence.controversy_score * 100)

        # Category-based scoring
        if story.category:
            cat = story.category.value if hasattr(story.category, 'value') else str(story.category)
            if cat in ("open_source",):
                scores.open_source_score = 80
            elif cat in ("security",):
                scores.security_score = 80
            elif cat in ("funding", "regulation"):
                scores.enterprise_score = 70

        # Builder score from technical content
        if story.content or story.summary:
            scores.builder_score = 60

        # Overall score (weighted average)
        scores.overall_score = int(
            scores.signal_score * 0.3
            + (100 - scores.hype_score) * 0.2  # Lower hype is better
            + scores.builder_score * 0.2
            + scores.security_score * 0.1
            + scores.open_source_score * 0.1
            + scores.enterprise_score * 0.1
        )

        return scores
