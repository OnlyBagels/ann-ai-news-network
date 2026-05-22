"""Oversight Agents - Governance, risk assessment, and quality control."""

from __future__ import annotations

import json

import httpx

from ann_agents.core.base_agent import BaseAgent
from ann_agents.core.config import settings
from ann_agents.core.types import (
    AgentRole,
    RiskAssessment,
    RiskLevel,
    SignalScores,
    Story,
    StoryStatus,
)
from ann_agents.llm.router import LLMTier, llm_router


SECOND_REVIEW_SYSTEM_PROMPT = """You are ANN's independent secondary reviewer.
You are used as a second AI pass to reduce false positives and false negatives.

Return strict JSON only:
{
  "decision": "approve" | "review" | "reject",
  "reason": "short explanation",
  "confidence": 0.0-1.0,
  "hallucination_risk": 0.0-1.0,
  "has_sufficient_evidence": true | false
}

Rules:
- approve: evidence is strong, claims appear verifiable, risk is low.
- review: mixed case; human should decide.
- reject: evidence is thin, claims are unsupported, or hallucination risk is high.
- No markdown or prose outside JSON.
"""


class RiskAgent(BaseAgent):
    """Flags risky content: lawsuits, defamation, unverified leaks, dangerous info."""

    def __init__(self):
        super().__init__(AgentRole.RISK_AGENT)

    async def process(self, story: Story) -> Story:
        """Assess risk level of a story."""
        source_text = (
            f"Title: {story.title}\n"
            f"Summary: {story.summary or 'N/A'}\n"
            f"Content: {self._truncate(story.content or 'N/A', max_chars=5000)}"
        )

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
        source_text = (
            f"Title: {story.title}\n"
            f"Summary: {story.summary or 'N/A'}\n"
            f"Sources: {len(story.source_items)}"
        )

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
        source_text = (
            f"Title: {story.title}\n"
            f"Summary: {story.summary or 'N/A'}\n"
            f"Tags: {', '.join(story.tags)}"
        )

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
        confidence = story.confidence
        _ = (story.risk, len(story.agents_involved) > 0)

        second_review = await self._run_secondary_review(story)

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
            reject = (
                second_review["decision"] == "reject"
                or not second_review["has_sufficient_evidence"]
                or second_review["hallucination_risk"] >= 0.8
                or second_review["confidence"] < 0.35
            )
            if reject:
                story.status = StoryStatus.REJECTED
                story.human_reviewer = (
                    f"auto_audit_{second_review['provider']}"
                    if second_review.get("provider")
                    else "auto_audit"
                )
                story.human_notes = (
                    "Auto-rejected by secondary AI review: "
                    + (second_review["reason"] or "insufficient evidence")
                )[:1000]
                story.fact_check_status = "rejected_by_secondary_audit"
                if story.risk is None:
                    story.risk = RiskAssessment()
                story.risk.requires_human_review = False
                if "auto_rejected_low_confidence_audit" not in story.risk.risk_factors:
                    story.risk.risk_factors.append("auto_rejected_low_confidence_audit")
                if second_review["reason"]:
                    short_reason = second_review["reason"][:180]
                    if short_reason not in story.risk.risk_factors:
                        story.risk.risk_factors.append(short_reason)
            else:
                story.status = StoryStatus.NEEDS_HUMAN_REVIEW
                story.human_notes = (
                    "Secondary AI reviewer flagged low-confidence content for manual review: "
                    + (second_review["reason"] or "mixed signal")
                )[:1000]
        else:
            if self._is_auto_approve_candidate(story, second_review):
                story.status = StoryStatus.APPROVED
                story.human_reviewer = (
                    f"auto_gate_{second_review['provider']}"
                    if second_review.get("provider")
                    else "auto_gate"
                )
                story.human_notes = "Auto-approved by high-confidence gate and secondary AI reviewer."
                if story.risk is None:
                    story.risk = RiskAssessment()
                story.risk.requires_human_review = False
            else:
                story.status = StoryStatus.NEEDS_HUMAN_REVIEW

        story.scores = self._calculate_scores(story)
        return story

    async def _run_secondary_review(self, story: Story) -> dict:
        """Run second AI review, preferring DigitalOcean when configured."""
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
            "ARTICLE_SNIPPET:\n"
            f"{(story.content or '')[:3000] or '(none)'}\n"
        )

        if settings.do_reviewer_enabled and settings.do_reviewer_api_key:
            do_result = await self._run_do_secondary_review(user_prompt)
            if do_result is not None:
                return self._normalize_secondary_review(do_result, provider="digitalocean")

        fallback = await self._run_internal_secondary_review(user_prompt)
        if fallback is not None:
            return self._normalize_secondary_review(fallback, provider="internal")

        return {
            "decision": "reject",
            "reason": "secondary reviewer unavailable",
            "confidence": 0.0,
            "hallucination_risk": 1.0,
            "has_sufficient_evidence": False,
            "provider": "none",
        }

    async def _run_do_secondary_review(self, user_prompt: str) -> dict | None:
        """Call a DigitalOcean OpenAI-compatible chat completion endpoint."""
        base = settings.do_reviewer_base_url.rstrip("/")
        url = base if base.endswith("/chat/completions") else f"{base}/chat/completions"
        payload = {
            "model": settings.do_reviewer_model,
            "messages": [
                {"role": "system", "content": SECOND_REVIEW_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.1,
            "max_completion_tokens": 500,
        }
        headers = {
            "Authorization": f"Bearer {settings.do_reviewer_api_key}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=settings.do_reviewer_timeout_seconds) as client:
                resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code >= 400:
                return None
            data = resp.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            if not content:
                return None
            return json.loads(content)
        except Exception:
            return None

    async def _run_internal_secondary_review(self, user_prompt: str) -> dict | None:
        """Fallback secondary review via existing LLM router."""
        result = await llm_router.complete(
            tier=LLMTier.SOCIAL,
            system_prompt=SECOND_REVIEW_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.1,
            max_tokens=500,
            response_format={"type": "json_object"},
        )
        if not result:
            return None
        try:
            return json.loads(result)
        except json.JSONDecodeError:
            return None

    def _normalize_secondary_review(self, data: dict, provider: str) -> dict:
        """Normalize secondary-review JSON into a stable shape."""
        decision = str(data.get("decision", "reject")).strip().lower()
        if decision not in {"approve", "review", "reject"}:
            decision = "reject"

        return {
            "decision": decision,
            "reason": str(data.get("reason", "")).strip(),
            "confidence": float(data.get("confidence", 0.0) or 0.0),
            "hallucination_risk": float(data.get("hallucination_risk", 1.0) or 1.0),
            "has_sufficient_evidence": bool(data.get("has_sufficient_evidence", False)),
            "provider": provider,
        }

    def _is_auto_approve_candidate(self, story: Story, second_review: dict) -> bool:
        """Check whether a story qualifies for immediate auto-approval."""
        if not settings.auto_approve_enabled:
            return False
        # Second reviewer can veto auto-approval, but does not need to
        # explicitly return "approve" for very high-confidence drafts.
        if second_review.get("decision") == "reject":
            return False
        if not second_review.get("has_sufficient_evidence", False):
            return False

        confidence = story.confidence
        if confidence is None:
            return False
        if confidence.overall_confidence < settings.auto_approve_min_confidence:
            return False
        if confidence.hallucination_risk > settings.auto_approve_max_hallucination_risk:
            return False
        if confidence.verified_claims < settings.auto_approve_min_verified_claims:
            return False
        if confidence.citation_count < settings.auto_approve_min_citations:
            return False
        if not story.content or len(story.content.strip()) < settings.auto_approve_min_body_chars:
            return False
        return True

    def _calculate_scores(self, story: Story) -> SignalScores:
        """Calculate ANN's proprietary signal scores."""
        scores = SignalScores()

        if story.confidence:
            base = int(story.confidence.overall_confidence * 100)
            scores.signal_score = base
            scores.hype_score = int(story.confidence.controversy_score * 100)

        if story.category:
            cat = story.category.value if hasattr(story.category, "value") else str(story.category)
            if cat in ("open_source",):
                scores.open_source_score = 80
            elif cat in ("security",):
                scores.security_score = 80
            elif cat in ("funding", "regulation"):
                scores.enterprise_score = 70

        if story.content or story.summary:
            scores.builder_score = 60

        scores.overall_score = int(
            scores.signal_score * 0.3
            + (100 - scores.hype_score) * 0.2
            + scores.builder_score * 0.2
            + scores.security_score * 0.1
            + scores.open_source_score * 0.1
            + scores.enterprise_score * 0.1
        )

        return scores
