"""Meilisearch Sync - Indexes articles for full-text search.

Syncs articles from PostgreSQL to Meilisearch after the agent pipeline
completes processing. This enables the frontend search functionality.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from loguru import logger
from meilisearch import Client
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from ann_agents.core.config import settings


class MeilisearchSync:
    """Syncs articles from PostgreSQL to Meilisearch for search indexing."""

    def __init__(self):
        self.meili = Client(settings.meilisearch_host, settings.meilisearch_api_key)
        self.index = self.meili.index("articles")
        self.engine = create_engine(settings.database_url)
        self.SessionLocal = sessionmaker(bind=self.engine)

    def index_article(self, article_id: str) -> bool:
        """Index a single article in Meilisearch."""
        session = self.SessionLocal()
        try:
            row = session.execute(
                text("""
                    SELECT
                        a.id, a.title, a.slug, a.url, a.source,
                        a."sourceUrl", a.author, a."publishedAt",
                        a.summary, a."tlDr", a.content, a.tags,
                        a.category, a."storyStatus",
                        s."signalScore", s."hypeScore", s."builderScore",
                        s."securityScore", s."openSourceScore",
                        s."enterpriseScore", s."overallScore"
                    FROM "Article" a
                    LEFT JOIN "Scores" s ON s."articleId" = a.id
                    WHERE a.id = :id
                """),
                {"id": article_id},
            ).fetchone()

            if not row:
                logger.warning(f"Article {article_id} not found for indexing")
                return False

            document = {
                "id": row[0],
                "title": row[1],
                "slug": row[2],
                "url": row[3],
                "source": row[4],
                "sourceUrl": row[5],
                "author": row[6],
                "publishedAt": row[7].isoformat() if row[7] else None,
                "summary": row[8],
                "tlDr": row[9],
                "content": row[10],
                "tags": row[11] or [],
                "category": row[12],
                "storyStatus": row[13],
                "scores": {
                    "signalScore": row[14] or 0,
                    "hypeScore": row[15] or 0,
                    "builderScore": row[16] or 0,
                    "securityScore": row[17] or 0,
                    "openSourceScore": row[18] or 0,
                    "enterpriseScore": row[19] or 0,
                    "overallScore": row[20] or 0,
                },
            }

            self.index.add_documents([document])
            logger.info(f"Indexed article {article_id} in Meilisearch")
            return True

        except Exception as e:
            logger.error(f"Failed to index article {article_id}: {e}")
            return False
        finally:
            session.close()

    def reindex_all(self) -> int:
        """Reindex all approved/published articles."""
        session = self.SessionLocal()
        try:
            rows = session.execute(
                text("""
                    SELECT id FROM "Article"
                    WHERE "storyStatus" IN ('approved', 'published')
                    ORDER BY "publishedAt" DESC
                """)
            ).fetchall()

            count = 0
            for (article_id,) in rows:
                if self.index_article(article_id):
                    count += 1

            logger.info(f"Reindexed {count}/{len(rows)} articles")
            return count
        finally:
            session.close()

    def remove_article(self, article_id: str) -> bool:
        """Remove an article from the search index."""
        try:
            self.index.delete_document(article_id)
            logger.info(f"Removed article {article_id} from Meilisearch")
            return True
        except Exception as e:
            logger.error(f"Failed to remove article {article_id}: {e}")
            return False
