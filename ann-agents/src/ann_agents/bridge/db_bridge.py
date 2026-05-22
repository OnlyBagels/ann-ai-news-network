"""Database Bridge - Writes agent pipeline output to PostgreSQL for the web frontend.

This is the critical integration layer between the Python agentic newsroom
and the Next.js web frontend. It translates agent Story objects into
Prisma-compatible database records.
"""

from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from loguru import logger
from sqlalchemy import bindparam, create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from ann_agents.core.config import settings
from ann_agents.core.types import Story, StoryStatus


class DatabaseBridge:
    """Bridges agent pipeline output to the PostgreSQL database.

    Translates agent Story objects into the Prisma schema format
    that the Next.js frontend expects.
    """

    def __init__(self):
        self.engine = create_engine(settings.sqlalchemy_database_url)
        self.SessionLocal = sessionmaker(bind=self.engine)

    def save_story(self, story: Story) -> Optional[str]:
        """Save a processed story to the database.

        Returns the article ID if successful, None otherwise.
        """
        session = self.SessionLocal()
        try:
            article_id = self._upsert_article(session, story)
            session.commit()
            logger.info(f"Saved story '{story.title[:60]}' as article {article_id}")
            return article_id
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to save story '{story.title[:60]}': {e}")
            return None
        finally:
            session.close()

    def _upsert_article(self, session: Session, story: Story) -> str:
        """Insert or update an article record."""
        slug = story.slug or self._make_slug(story.title)
        url = story.url or story.primary_source.url if story.primary_source else f"https://ann.news/story/{slug}"

        # Check if article already exists
        existing = session.execute(
            text("SELECT id FROM \"Article\" WHERE url = :url"),
            {"url": url},
        ).fetchone()

        if existing:
            article_id = existing[0]
            self._update_article(session, article_id, story, slug)
        else:
            article_id = self._insert_article(session, story, slug, url)

        # Save scores
        self._upsert_scores(session, article_id, story)

        # Save agent actions
        self._save_agent_actions(session, article_id, story)

        return article_id

    def _insert_article(self, session: Session, story: Story, slug: str, url: str) -> str:
        """Insert a new article record."""
        primary = story.primary_source
        source_name = primary.source_name if primary else "ANN Agents"
        source_url = primary.url if primary else None
        author = primary.author if primary else None
        published_at = primary.published_at if primary else story.created_at

        result = session.execute(
            text("""
                INSERT INTO "Article" (
                    id, title, slug, url, source, "sourceUrl", author,
                    "publishedAt", summary, "tlDr", content, tags, category,
                    "storyStatus", "agentsInvolved", "sourcesAnalyzed",
                    "factCheckStatus",
                    "overall_confidence", "source_quality", "controversy_score",
                    "citation_count", "verified_claims", "unverified_claims",
                    "hallucination_risk",
                    "risk_level", "risk_factors", "requires_human_review",
                    "legal_concerns", "bias_concerns", "safety_flags",
                    "createdAt", "updatedAt"
                ) VALUES (
                    gen_random_uuid()::text, :title, :slug, :url, :source, :source_url, :author,
                    :published_at, :summary, :tl_dr, :content, :tags, CAST(:category AS "Category"),
                    CAST(:status AS "StoryStatus"), :agents, :sources_analyzed,
                    :fact_check_status,
                    :overall_confidence, :source_quality, :controversy_score,
                    :citation_count, :verified_claims, :unverified_claims,
                    :hallucination_risk,
                    :risk_level, :risk_factors, :requires_human_review,
                    :legal_concerns, :bias_concerns, :safety_flags,
                    NOW(), NOW()
                ) RETURNING id
            """),
            {
                "title": story.title,
                "slug": slug,
                "url": url,
                "source": source_name,
                "source_url": source_url,
                "author": author,
                "published_at": published_at,
                "summary": story.summary or "",
                "tl_dr": story.tl_dr,
                "content": story.content,
                "tags": self._to_pg_array(story.tags),
                "category": story.category.value if story.category else "research",
                "status": story.status.value,
                "agents": self._to_pg_array([r.value for r in story.agents_involved]),
                "sources_analyzed": story.sources_analyzed,
                "fact_check_status": story.fact_check_status,
                "overall_confidence": story.confidence.overall_confidence if story.confidence else None,
                "source_quality": story.confidence.source_quality if story.confidence else None,
                "controversy_score": story.confidence.controversy_score if story.confidence else None,
                "citation_count": story.confidence.citation_count if story.confidence else None,
                "verified_claims": story.confidence.verified_claims if story.confidence else None,
                "unverified_claims": story.confidence.unverified_claims if story.confidence else None,
                "hallucination_risk": story.confidence.hallucination_risk if story.confidence else None,
                "risk_level": story.risk.risk_level.value if story.risk else "low",
                "risk_factors": self._to_pg_array(story.risk.risk_factors if story.risk else []),
                "requires_human_review": story.risk.requires_human_review if story.risk else False,
                "legal_concerns": self._to_pg_array(story.risk.legal_concerns if story.risk else []),
                "bias_concerns": self._to_pg_array(story.risk.bias_concerns if story.risk else []),
                "safety_flags": self._to_pg_array(story.risk.safety_flags if story.risk else []),
            },
        )
        return result.fetchone()[0]

    def _update_article(self, session: Session, article_id: str, story: Story, slug: str):
        """Update an existing article record."""
        session.execute(
            text("""
                UPDATE "Article" SET
                    title = :title,
                    summary = :summary,
                    "tlDr" = :tl_dr,
                    content = :content,
                    tags = :tags,
                    category = CAST(:category AS "Category"),
                    "storyStatus" = CAST(:status AS "StoryStatus"),
                    "agentsInvolved" = :agents,
                    "sourcesAnalyzed" = :sources_analyzed,
                    "factCheckStatus" = :fact_check_status,
                    "overall_confidence" = :overall_confidence,
                    "source_quality" = :source_quality,
                    "controversy_score" = :controversy_score,
                    "citation_count" = :citation_count,
                    "verified_claims" = :verified_claims,
                    "unverified_claims" = :unverified_claims,
                    "hallucination_risk" = :hallucination_risk,
                    "risk_level" = :risk_level,
                    "risk_factors" = :risk_factors,
                    "requires_human_review" = :requires_human_review,
                    "legal_concerns" = :legal_concerns,
                    "bias_concerns" = :bias_concerns,
                    "safety_flags" = :safety_flags,
                    "updatedAt" = NOW()
                WHERE id = :id
            """),
            {
                "id": article_id,
                "title": story.title,
                "summary": story.summary or "",
                "tl_dr": story.tl_dr,
                "content": story.content,
                "tags": self._to_pg_array(story.tags),
                "category": story.category.value if story.category else "research",
                "status": story.status.value,
                "agents": self._to_pg_array([r.value for r in story.agents_involved]),
                "sources_analyzed": story.sources_analyzed,
                "fact_check_status": story.fact_check_status,
                "overall_confidence": story.confidence.overall_confidence if story.confidence else None,
                "source_quality": story.confidence.source_quality if story.confidence else None,
                "controversy_score": story.confidence.controversy_score if story.confidence else None,
                "citation_count": story.confidence.citation_count if story.confidence else None,
                "verified_claims": story.confidence.verified_claims if story.confidence else None,
                "unverified_claims": story.confidence.unverified_claims if story.confidence else None,
                "hallucination_risk": story.confidence.hallucination_risk if story.confidence else None,
                "risk_level": story.risk.risk_level.value if story.risk else "low",
                "risk_factors": self._to_pg_array(story.risk.risk_factors if story.risk else []),
                "requires_human_review": story.risk.requires_human_review if story.risk else False,
                "legal_concerns": self._to_pg_array(story.risk.legal_concerns if story.risk else []),
                "bias_concerns": self._to_pg_array(story.risk.bias_concerns if story.risk else []),
                "safety_flags": self._to_pg_array(story.risk.safety_flags if story.risk else []),
            },
        )

    def _upsert_scores(self, session: Session, article_id: str, story: Story):
        """Insert or update scores for an article."""
        if not story.scores:
            return

        existing = session.execute(
            text('SELECT id FROM "Scores" WHERE "articleId" = :article_id'),
            {"article_id": article_id},
        ).fetchone()

        if existing:
            session.execute(
                text("""
                    UPDATE "Scores" SET
                        "signalScore" = :signal,
                        "hypeScore" = :hype,
                        "builderScore" = :builder,
                        "securityScore" = :security,
                        "openSourceScore" = :open_source,
                        "enterpriseScore" = :enterprise,
                        "overallScore" = :overall
                    WHERE "articleId" = :article_id
                """),
                {
                    "article_id": article_id,
                    "signal": story.scores.signal_score,
                    "hype": story.scores.hype_score,
                    "builder": story.scores.builder_score,
                    "security": story.scores.security_score,
                    "open_source": story.scores.open_source_score,
                    "enterprise": story.scores.enterprise_score,
                    "overall": story.scores.overall_score,
                },
            )
        else:
            session.execute(
                text("""
                    INSERT INTO "Scores" (
                        id, "articleId",
                        "signalScore", "hypeScore", "builderScore",
                        "securityScore", "openSourceScore", "enterpriseScore",
                        "overallScore"
                    ) VALUES (
                        gen_random_uuid()::text, :article_id,
                        :signal, :hype, :builder,
                        :security, :open_source, :enterprise,
                        :overall
                    )
                """),
                {
                    "article_id": article_id,
                    "signal": story.scores.signal_score,
                    "hype": story.scores.hype_score,
                    "builder": story.scores.builder_score,
                    "security": story.scores.security_score,
                    "open_source": story.scores.open_source_score,
                    "enterprise": story.scores.enterprise_score,
                    "overall": story.scores.overall_score,
                },
            )

    def _save_agent_actions(self, session: Session, article_id: str, story: Story):
        """Save agent action records."""
        for action in story.agent_actions:
            session.execute(
                text("""
                    INSERT INTO "AgentAction" (
                        id, "articleId", "agentRole", state,
                        "startedAt", "completedAt", output, error, "durationMs"
                    ) VALUES (
                        gen_random_uuid()::text, :article_id, :role, :state,
                        :started_at, :completed_at, CAST(:output AS jsonb), :error, :duration_ms
                    )
                """),
                {
                    "article_id": article_id,
                    "role": action.agent_role.value,
                    "state": action.state.value,
                    "started_at": action.started_at,
                    "completed_at": action.completed_at,
                    "output": json.dumps(action.output) if action.output else None,
                    "error": action.error,
                    "duration_ms": action.duration_ms,
                },
            )

    def get_human_review_queue(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Get articles needing human review."""
        session = self.SessionLocal()
        try:
            rows = session.execute(
                text("""
                    SELECT a.id, a.title, a.summary, a.category, a."storyStatus",
                           a."risk_level", a."requires_human_review",
                           a."overall_confidence", a."hallucination_risk",
                           a."createdAt"
                    FROM "Article" a
                    WHERE a."storyStatus" = 'needs_human_review'::"StoryStatus"
                       OR a."requires_human_review" = true
                    ORDER BY a."hallucination_risk" DESC NULLS LAST,
                             a."createdAt" DESC
                    LIMIT :limit
                """),
                {"limit": limit},
            ).fetchall()

            return [
                {
                    "id": r[0],
                    "title": r[1],
                    "summary": r[2],
                    "category": r[3],
                    "status": r[4],
                    "riskLevel": r[5],
                    "requiresReview": r[6],
                    "confidence": r[7],
                    "hallucinationRisk": r[8],
                    "createdAt": r[9].isoformat() if r[9] else None,
                }
                for r in rows
            ]
        finally:
            session.close()

    def filter_new_urls(self, urls: List[str]) -> List[str]:
        """Return URLs that do not already exist in the Article table."""
        deduped = [u for u in dict.fromkeys(urls) if u]
        if not deduped:
            return []

        session = self.SessionLocal()
        try:
            stmt = text('SELECT url FROM "Article" WHERE url IN :urls').bindparams(
                bindparam("urls", expanding=True)
            )
            rows = session.execute(stmt, {"urls": deduped}).fetchall()
            existing = {row[0] for row in rows}
            return [url for url in deduped if url not in existing]
        finally:
            session.close()

    def approve_article(self, article_id: str, reviewer: str = "system") -> bool:
        """Approve an article for publication."""
        session = self.SessionLocal()
        try:
            session.execute(
                text("""
                    UPDATE "Article" SET
                        "storyStatus" = 'approved'::"StoryStatus",
                        "humanReviewer" = :reviewer,
                        "publishedAtReal" = NOW(),
                        "updatedAt" = NOW()
                    WHERE id = :id
                """),
                {"id": article_id, "reviewer": reviewer},
            )
            session.commit()
            return True
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to approve article {article_id}: {e}")
            return False
        finally:
            session.close()

    def reject_article(self, article_id: str, notes: str = "") -> bool:
        """Reject an article."""
        session = self.SessionLocal()
        try:
            session.execute(
                text("""
                    UPDATE "Article" SET
                        "storyStatus" = 'rejected'::"StoryStatus",
                        "humanNotes" = :notes,
                        "updatedAt" = NOW()
                    WHERE id = :id
                """),
                {"id": article_id, "notes": notes},
            )
            session.commit()
            return True
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to reject article {article_id}: {e}")
            return False
        finally:
            session.close()

    def _make_slug(self, title: str) -> str:
        """Create a URL-friendly slug from a title."""
        slug = title.lower()
        slug = re.sub(r"[^a-z0-9\s-]", "", slug)
        slug = re.sub(r"\s+", "-", slug)
        slug = re.sub(r"-+", "-", slug)
        slug = slug.strip("-")
        timestamp = int(datetime.utcnow().timestamp())
        return f"{slug[:80]}-{timestamp}"

    def _to_pg_array(self, items: List[str]) -> str:
        """Convert a Python list to a PostgreSQL array string."""
        if not items:
            return "{}"
        escaped = [f'"{item.replace('"', '\\"')}"' for item in items]
        return "{" + ",".join(escaped) + "}"
