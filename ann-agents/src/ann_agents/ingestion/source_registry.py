"""The newsroom's sources, kept in the Source table so editors can manage them.

Each cycle reads the active sources, fetches them, and records how it went:
when a feed last worked, its last error, and how many fetches in a row have
failed. The defaults below are added once; edits made in the admin area win.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List, Optional, Sequence, Tuple

from loguru import logger
from sqlalchemy import text
from sqlalchemy.engine import Engine

from ann_agents.core.types import SourceItem
from ann_agents.ingestion.source_ingester import SourceIngester

# (name, type, url, category, ai_only). Names are read on air, so they are
# the names readers know, not whatever the feed calls itself.
DEFAULT_SOURCES: List[Tuple[str, str, Optional[str], Optional[str], bool]] = [
    ("OpenAI News", "rss", "https://openai.com/blog/rss.xml", "models", True),
    ("Google AI Blog", "rss", "https://blog.google/technology/ai/rss/", "models", True),
    ("Google DeepMind", "rss", "https://deepmind.google/blog/rss.xml", "models", True),
    ("Mistral AI", "rss", "https://mistral.ai/news/rss/", "models", True),
    ("Hugging Face Blog", "rss", "https://huggingface.co/blog/feed.xml", "open_source", True),
    ("Hacker News", "hackernews", "https://news.ycombinator.com", None, False),
    ("arXiv", "arxiv", "https://arxiv.org/list/cs.AI/recent", "research", True),
    ("GitHub Trending", "github_trending", "https://github.com/trending", "open_source", False),
    ("HuggingFace", "huggingface", "https://huggingface.co/models", "open_source", True),
]

FEED_LIMIT = 30


@dataclass
class SourceRow:
    id: str
    name: str
    type: str
    url: Optional[str]
    category: Optional[str]
    ai_only: bool


class SourceRegistry:
    def __init__(self, engine: Engine, ingester: Optional[SourceIngester] = None):
        self.engine = engine
        self.ingester = ingester or SourceIngester()

    def seed(self, sources: Sequence[Tuple[str, str, Optional[str], Optional[str], bool]] = DEFAULT_SOURCES) -> int:
        """Add any default source that isn't in the table yet (matched by name or URL)."""
        added = 0
        with self.engine.begin() as conn:
            for name, kind, url, category, ai_only in sources:
                exists = conn.execute(
                    text('SELECT 1 FROM "Source" WHERE name = :name OR (url IS NOT NULL AND url = :url)'),
                    {"name": name, "url": url},
                ).first()
                if exists:
                    continue
                conn.execute(
                    text("""
                        INSERT INTO "Source" (id, name, url, type, category, "aiOnly", "isActive", failures,
                                              "createdAt", "updatedAt")
                        VALUES (gen_random_uuid()::text, :name, :url, :type, :category, :ai_only, true, 0, now(), now())
                    """),
                    {"name": name, "url": url, "type": kind, "category": category, "ai_only": ai_only},
                )
                added += 1
        if added:
            logger.info(f"[sources] added {added} default source(s)")
        return added

    def active(self) -> List[SourceRow]:
        with self.engine.connect() as conn:
            rows = conn.execute(
                text('SELECT id, name, type, url, category, "aiOnly" FROM "Source" WHERE "isActive" ORDER BY name')
            ).fetchall()
        return [SourceRow(*r) for r in rows]

    def record(self, source: SourceRow, items: int, error: Optional[str]) -> None:
        now = datetime.now(timezone.utc)
        with self.engine.begin() as conn:
            if error is None:
                conn.execute(
                    text("""
                        UPDATE "Source" SET "lastFetched" = :now, "lastSuccessAt" = :now, "lastItemCount" = :items,
                               "lastError" = NULL, failures = 0, "updatedAt" = :now WHERE id = :id
                    """),
                    {"now": now, "items": items, "id": source.id},
                )
            else:
                conn.execute(
                    text("""
                        UPDATE "Source" SET "lastFetched" = :now, "lastError" = :error, "lastItemCount" = :items,
                               failures = failures + 1, "updatedAt" = :now WHERE id = :id
                    """),
                    {"now": now, "error": error[:500], "items": items, "id": source.id},
                )

    async def _fetch(self, source: SourceRow) -> List[SourceItem]:
        ing = self.ingester
        if source.type == "rss":
            return await ing.fetch_feed(source.url or "", source.name, FEED_LIMIT)
        if source.type == "hackernews":
            items = await ing.ingest_hn(top_n=30)
        elif source.type == "arxiv":
            items = await ing.ingest_arxiv(max_results=20)
        elif source.type == "github_trending":
            items = await ing.ingest_github_trending()
        elif source.type == "huggingface":
            items = await ing.ingest_huggingface(limit=20)
        else:
            raise ValueError(f"unknown source type {source.type!r}")
        if not items:
            raise RuntimeError("returned no items")
        return items

    async def fetch_all(self, concurrency: int = 8) -> List[SourceItem]:
        """Fetch every active source, a few at a time, recording each one's health."""
        gate = asyncio.Semaphore(concurrency)

        async def one(source: SourceRow) -> List[SourceItem]:
            async with gate:
                try:
                    items = await self._fetch(source)
                except Exception as e:
                    logger.warning(f"[sources] {source.name} failed: {e}")
                    self.record(source, 0, f"{type(e).__name__}: {e}")
                    return []
            for item in items:
                item.source_name = source.name
                item.metadata["source_id"] = source.id
                item.metadata["ai_only"] = source.ai_only
                if source.category:
                    item.metadata["category_hint"] = source.category
            self.record(source, len(items), None)
            return items

        results = await asyncio.gather(*(one(s) for s in self.active()))
        return [item for batch in results for item in batch]
