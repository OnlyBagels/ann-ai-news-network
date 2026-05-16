"""Fact-Check Agent - Validates claims, sources, and detects hallucinations."""

from __future__ import annotations

from ann_agents.core.base_agent import BaseAgent
from ann_agents.core.types import AgentRole, ConfidenceScore, Story
from ann_agents.llm.router import LLMTier, llm_router


SYSTEM_PROMPT = """You are a Fact-Check Agent for ANN (AI News Network).
Your job: rigorously verify claims and sources in stories.

For each story, you must:
1. Verify citations and references
2. Identify contradictions between sources
3. Detect potential hallucinations or unsupported claims
4. Compare information across multiple sources
5. Flag unsupported or exaggerated claims
6. Validate benchmark results and pricing claims
7. Assess source quality and credibility

Output a JSON object with:
- overall_confidence (0.0-1.0): How confident are we in this story's accuracy?
- source_quality (0.0-1.0): Quality of the sources used
- controversy_score (0.0-1.0): How controversial/disputed is this story?
- citation_count (int): Number of verifiable citations
- verified_claims (int): Number of claims that could be verified
- unverified_claims (int): Number of claims that could not be verified
- hallucination_risk (0.0-1.0): Risk of hallucination/misinformation
- flags[]: List of specific concerns or issues found"""


class FactCheckAgent(BaseAgent):
    """Agent that fact-checks stories and produces confidence scores."""

    def __init__(self):
        super().__init__(AgentRole.FACT_CHECK_AGENT)

    async def process(self, story: Story) -> Story:
        """Fact-check a story and produce confidence scores."""
        source_text = self._build_source_text(story)

        result = await llm_router.complete(
            tier=LLMTier.PREMIUM,  # Fact-checking needs highest accuracy
            system_prompt=SYSTEM_PROMPT,
            user_prompt=f"Fact-check this story thoroughly:\n\n{source_text}",
            response_format={"type": "json_object"},
        )

        if result:
            import json
            try:
                data = json.loads(result)
                story.confidence = ConfidenceScore(
                    overall_confidence=data.get("overall_confidence", 0.5),
                    source_quality=data.get("source_quality", 0.5),
                    controversy_score=data.get("controversy_score", 0.0),
                    citation_count=data.get("citation_count", 0),
                    verified_claims=data.get("verified_claims", 0),
                    unverified_claims=data.get("unverified_claims", 0),
                    hallucination_risk=data.get("hallucination_risk", 0.0),
                )
                story.fact_check_status = "verified" if story.confidence.overall_confidence >= 0.7 else "needs_review"
            except json.JSONDecodeError:
                story.fact_check_status = "error"

        return story

    def _build_source_text(self, story: Story) -> str:
        """Build text with all sources for fact-checking."""
        parts = [f"Title: {story.title}"]
        if story.summary:
            parts.append(f"Summary: {story.summary}")
        if story.content:
            parts.append(f"Content: {self._truncate(story.content, max_chars=10000)}")

        for i, src in enumerate(story.source_items):
            parts.append(f"\n--- Source {i + 1}: {src.source_name} ---")
            parts.append(f"URL: {src.url}")
            parts.append(f"Author: {src.author or 'Unknown'}")
            if src.content:
                parts.append(f"Content: {self._truncate(src.content, max_chars=3000)}")

        return "\n".join(parts)
