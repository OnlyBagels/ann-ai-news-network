"""Scheduler - Periodically ingests sources and runs the agent pipeline.

Runs on a configurable interval to:
1. Ingest from all configured sources (RSS, HN, arXiv, GitHub, HuggingFace)
2. Run the agent pipeline on each story
3. Save results to the database
4. Index in Meilisearch
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from typing import List, Optional

from loguru import logger

from ann_agents.bridge.db_bridge import DatabaseBridge
from ann_agents.bridge.meilisearch_sync import MeilisearchSync
from ann_agents.core.config import settings
from ann_agents.core.types import SourceItem, Story
from ann_agents.ingestion.source_ingester import SourceIngester
from ann_agents.pipeline.story_pipeline import StoryPipeline


class NewsroomScheduler:
    """Orchestrates periodic ingestion and processing of AI news."""

    def __init__(self):
        self.ingester = SourceIngester()
        self.pipeline = StoryPipeline()
        self.db = DatabaseBridge()
        self.search = MeilisearchSync()
        self._running = False

    async def run_once(self) -> int:
        """Run a single ingestion + pipeline cycle.

        Returns the number of stories processed.
        """
        logger.info("=== Newsroom Scheduler: Starting ingestion cycle ===")

        # Step 1: Ingest from all sources
        all_items = await self._ingest_all()
        logger.info(f"Ingested {len(all_items)} total items")

        # Step 2: Deduplicate by URL
        seen_urls: set = set()
        unique_items: List[SourceItem] = []
        for item in all_items:
            if item.url not in seen_urls:
                seen_urls.add(item.url)
                unique_items.append(item)

        logger.info(f"{len(unique_items)} unique items after dedup")

        # Step 3: Run pipeline on each item
        processed = 0
        for item in unique_items[:settings.max_concurrent_stories]:
            story = Story(
                title=item.title,
                source_items=[item],
                primary_source=item,
                tags=item.tags,
            )

            try:
                result = await self.pipeline.run_full_pipeline(story)

                # Save to database
                article_id = self.db.save_story(result)
                if article_id:
                    # Index in Meilisearch
                    self.search.index_article(article_id)
                    processed += 1

            except Exception as e:
                logger.error(f"Pipeline failed for '{item.title[:60]}': {e}")

        logger.info(f"=== Cycle complete: {processed}/{len(unique_items)} stories processed ===")
        return processed

    async def run_forever(self, interval_minutes: int = 15):
        """Run the ingestion cycle on a loop."""
        self._running = True
        logger.info(f"Scheduler started, running every {interval_minutes} minutes")

        while self._running:
            try:
                await self.run_once()
            except Exception as e:
                logger.error(f"Scheduler cycle failed: {e}")

            logger.info(f"Sleeping for {interval_minutes} minutes...")
            await asyncio.sleep(interval_minutes * 60)

    def stop(self):
        """Stop the scheduler."""
        self._running = False
        logger.info("Scheduler stopped")

    async def _ingest_all(self) -> List[SourceItem]:
        """Ingest from all configured sources."""
        all_items: List[SourceItem] = []

        # RSS Feeds (AI news sources)
        rss_feeds = [
            "https://openai.com/blog/rss.xml",
            "https://www.anthropic.com/feed.xml",
            "https://blog.google/technology/ai/rss/",
            "https://ai.meta.com/blog/rss/",
            "https://deepmind.google/blog/rss.xml",
            "https://mistral.ai/news/rss/",
            "https://huggingface.co/blog/feed.xml",
            "https://news.ycombinator.com/rss",
        ]

        for feed_url in rss_feeds:
            items = await self.ingester.ingest_rss(feed_url)
            all_items.extend(items)

        # Hacker News
        hn_items = await self.ingester.ingest_hn(top_n=30)
        all_items.extend(hn_items)

        # arXiv
        arxiv_items = await self.ingester.ingest_arxiv(max_results=20)
        all_items.extend(arxiv_items)

        # GitHub Trending
        github_items = await self.ingester.ingest_github_trending()
        all_items.extend(github_items)

        # HuggingFace
        hf_items = await self.ingester.ingest_huggingface(limit=20)
        all_items.extend(hf_items)

        return all_items
