"""Oversight Agents - Governance, risk assessment, and quality control."""

from __future__ import annotations

import json

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


AUDIT_SYSTEM_PROMPT = """You are ANN's independent editorial auditor.
You are the second-opinion model used only for low-confidence drafts.

Return strict JSON only:
{
  "decision": "review" | "reject",
  "reason": "short explanation",
  "confidence": 0.0-1.0,
  "hallucination_risk": 0.0-1.0,
  "has_sufficient_evidence": true | false
}

Rules:
- Reject when evidence is thin, claims are unverified, or body/source text is too sparse.
- Prefer reject over uncertain review.
- No markdown or prose outside JSON.
"""


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
        _ = (risk, has_agents)  # signals already captured on the story

        low_confidence = (
            confidence is None
            or confidence.overall_confidence < 0.35
            or confidence.hallucination_risk >= 0.85
        )
        missing_body = not story.content or len(story.content.strip()) < 220
        no_verifiable_claims = (
            confidence is not None
            and confidence.verified_claims == 0
            and confidence.citation_count == 0
            and confidence.unverified_claims > 0
        )

        should_audit = low_confidence or missing_body or no_verifiable_claims
        if should_audit:
            audit = await self._run_low_confidence_audit(story)
            reject = (
                audit["decision"] == "reject"
                or not audit["has_sufficient_evidence"]
                or audit["hallucination_risk"] >= 0.8
                or audit["confidence"] < 0.35
            )
            if reject:
                story.status = StoryStatus.REJECTED
                story.human_reviewer = "auto_audit"
                story.human_notes = (
                    "Auto-rejected by secondary LLM audit: "
                    + (audit["reason"] or "insufficient evidence")
                )[:1000]
                story.fact_check_status = "rejected_by_secondary_audit"
                if story.risk is None:
                    story.risk = RiskAssessment()
                story.risk.requires_human_review = False
                if "auto_rejected_low_confidence_audit" not in story.risk.risk_factors:
                    story.risk.risk_factors.append("auto_rejected_low_confidence_audit")
                if audit["reason"]:
                    short_reason = audit["reason"][:180]
                    if short_reason not in story.risk.risk_factors:
                        story.risk.risk_factors.append(short_reason)
            else:
                story.status = StoryStatus.NEEDS_HUMAN_REVIEW
        else:
            # Standard path: all non-rejected stories go to human review.
            story.status = StoryStatus.NEEDS_HUMAN_REVIEW

        # Calculate signal scores
        story.scores = self._calculate_scores(story)

        return story

    async def _run_low_confidence_audit(self, story: Story) -> dict:
        """Second-opinion LLM audit for low-confidence drafts."""
        conf = story.confidence
        conf_block = {
            "overall_confidence": conf.overall_confidence if conf else None,
            "hallucination_risk": conf.hallucination_risk if conf else None,
            "citation_count": conf.citation_count if conf else None,
            "verified_claims": conf.verified_claims if conf else None,
            "unverified_claims": conf.unverified_claims if conf else None,
            "source_quality": conf.source_quality if conf else None,
        }
        source_text = (story.primary_source.content or "") if story.primary_source else ""
        user_prompt = (
            f"TITLE: {story.title}\n"
            f"SUMMARY: {story.summary or '(none)'}\n"
            f"BODY_PRESENT: {'yes' if story.content else 'no'}\n"
            f"SOURCE_TEXT_LEN: {len(source_text.strip())}\n"
            f"SOURCES_ANALYZED: {story.sources_analyzed}\n"
            f"CONFIDENCE: {json.dumps(conf_block)}\n\n"
            "SOURCE_SNIPPET:\n"
            f"{source_text[:3000] or '(none)'}\n"
        )

        result = await llm_router.complete(
            tier=LLMTier.SOCIAL,  # second lane for independent audit when available
            system_prompt=AUDIT_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.1,
            max_tokens=500,
            response_format={"type": "json_object"},
        )

        # "If nothing else, insta decline" fallback.
        if not result:
            return {
                "decision": "reject",
                "reason": "secondary audit returned no output",
                "confidence": 0.0,
                "hallucination_risk": 1.0,
                "has_sufficient_evidence": False,
            }

        try:
            data = json.loads(result)
        except json.JSONDecodeError:
            return {
                "decision": "reject",
                "reason": "secondary audit returned invalid JSON",
                "confidence": 0.0,
                "hallucination_risk": 1.0,
                "has_sufficient_evidence": False,
            }

        decision = str(data.get("decision", "reject")).strip().lower()
        if decision not in {"review", "reject"}:
            decision = "reject"

        return {
            "decision": decision,
            "reason": str(data.get("reason", "")).strip(),
            "confidence": float(data.get("confidence", 0.0) or 0.0),
            "hallucination_risk": float(data.get("hallucination_risk", 1.0) or 1.0),
            "has_sufficient_evidence": bool(data.get("has_sufficient_evidence", False)),
        }

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
