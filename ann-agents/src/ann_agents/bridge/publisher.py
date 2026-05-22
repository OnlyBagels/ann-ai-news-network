"""Publisher - post finished Story drafts to ann-web for human review.

Called at the tail end of StoryPipeline.run_full_pipeline. Serializes a
Story (with all the agent enrichments: scores, confidence, risk,
agent_actions) into the JSON shape that POST /api/agents/draft on
ann-web expects, then posts it. The endpoint upserts an Article row;
the admin review queue picks it up automatically.

Idempotency key: story.url, or `ann://internal/{story.id}` when there
is no external URL.

Environment:
- ANN_WEB_URL       base URL of ann-web (default: http://localhost:3000)
- ANN_AGENT_SECRET  shared secret sent as X-Agent-Secret header (optional
                    in dev; required in any non-local env)
"""

from __future__ import annotations

import os
import re
from typing import Any, Dict, Optional

import httpx
from loguru import logger

from ann_agents.core.types import Story


def _slugify(text: str) -> str:
    """URL-safe slug. Matches the format ann-web's draft route generates."""
    cleaned = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return cleaned[:80]


def _enum_value(value: Any) -> Any:
    """Return .value for Enum-like objects, pass through everything else."""
    return value.value if hasattr(value, "value") else value


def _serialize_story(story: Story) -> Dict[str, Any]:
    """Translate a Story into the JSON payload the draft endpoint expects."""
    # Fall back to the primary source's body text when an editorial agent
    # hasn't written story.content yet — better than shipping an empty
    # Article.content to the admin queue.
    body = story.content
    if not body and story.primary_source:
        body = story.primary_source.content

    payload: Dict[str, Any] = {
        "id": story.id,
        "title": story.title,
        "slug": story.slug or f"{_slugify(story.title)}-{story.id[-6:]}",
        "url": story.url,
        "summary": story.summary or "",
        "tlDr": story.tl_dr,
        "content": body,
        "tags": list(story.tags),
        "category": _enum_value(story.category) if story.category else None,
        "section": story.section,
        "region": story.region,
        "headline": story.headline,
        "storyStatus": _enum_value(story.status),
        "agentsInvolved": [_enum_value(r) for r in story.agents_involved],
        "sourcesAnalyzed": story.sources_analyzed,
        "factCheckStatus": story.fact_check_status,
        "humanReviewer": story.human_reviewer,
        "humanNotes": story.human_notes,
    }

    if not payload["url"] and story.primary_source:
        payload["url"] = story.primary_source.url

    if story.primary_source:
        src = story.primary_source
        payload["source"] = src.source_name
        payload["sourceUrl"] = src.url
        payload["author"] = src.author
        payload["publishedAt"] = src.published_at.isoformat()

    if story.confidence:
        c = story.confidence
        payload["confidence"] = {
            "overallConfidence": c.overall_confidence,
            "sourceQuality": c.source_quality,
            "controversyScore": c.controversy_score,
            "citationCount": c.citation_count,
            "verifiedClaims": c.verified_claims,
            "unverifiedClaims": c.unverified_claims,
            "hallucinationRisk": c.hallucination_risk,
        }

    if story.scores:
        sc = story.scores
        payload["scores"] = {
            "signalScore": sc.signal_score,
            "hypeScore": sc.hype_score,
            "builderScore": sc.builder_score,
            "securityScore": sc.security_score,
            "openSourceScore": sc.open_source_score,
            "enterpriseScore": sc.enterprise_score,
            "overallScore": sc.overall_score,
        }

    if story.risk:
        r = story.risk
        payload["risk"] = {
            "riskLevel": _enum_value(r.risk_level),
            "riskFactors": list(r.risk_factors),
            "requiresHumanReview": r.requires_human_review,
            "legalConcerns": list(r.legal_concerns),
            "biasConcerns": list(r.bias_concerns),
            "safetyFlags": list(r.safety_flags),
        }

    if story.agent_actions:
        payload["agentActions"] = [
            {
                "agentRole": _enum_value(a.agent_role),
                "state": _enum_value(a.state),
                "startedAt": a.started_at.isoformat() if a.started_at else None,
                "completedAt": a.completed_at.isoformat() if a.completed_at else None,
                "output": a.output,
                "error": a.error,
                "durationMs": a.duration_ms,
            }
            for a in story.agent_actions
        ]

    return payload


class Publisher:
    """Posts a finished Story to ann-web's /api/agents/draft endpoint."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        secret: Optional[str] = None,
        timeout: float = 10.0,
    ):
        self.base_url = (
            base_url or os.getenv("ANN_WEB_URL") or "http://localhost:3000"
        ).rstrip("/")
        self.secret = secret or os.getenv("ANN_AGENT_SECRET") or ""
        self.timeout = timeout

    async def publish(self, story: Story) -> Optional[Dict[str, Any]]:
        """Send the story to the draft endpoint.

        Returns the parsed response body on success, None on failure.
        Failure does not raise — the Story stays in memory and the
        pipeline can retry later or surface the error in logs.
        """
        payload = {"story": _serialize_story(story)}
        headers = {"Content-Type": "application/json"}
        if self.secret:
            headers["X-Agent-Secret"] = self.secret

        url = f"{self.base_url}/api/agents/draft"
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code >= 400:
                logger.error(
                    f"[publisher] {resp.status_code} from {url}: {resp.text[:300]}"
                )
                return None
            body = resp.json()
            logger.info(
                f"[publisher] published article {body.get('articleId')} → "
                f"{body.get('status')}"
            )
            return body
        except Exception as e:
            logger.error(f"[publisher] post to {url} failed: {e}")
            return None


# Module-level singleton — most callers use this directly.
publisher = Publisher()
