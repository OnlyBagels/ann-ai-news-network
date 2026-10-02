"""Scheduler - Periodically ingests sources and runs the agent pipeline.

Runs on a configurable interval to:
1. Ingest from all configured sources (RSS, HN, arXiv, GitHub, HuggingFace)
2. Run the agent pipeline on each story
3. Save results to the database
4. Index in Meilisearch
"""

from __future__ import annotations

import asyncio

from typing import List

from loguru import logger

from ann_agents.bridge.db_bridge import DatabaseBridge
from ann_agents.bridge.meilisearch_sync import MeilisearchSync
from ann_agents.core.config import settings
from ann_agents.core.types import SourceItem, Story
from ann_agents.ingestion.article_text import fetch_article_text
from ann_agents.ingestion.source_ingester import SourceIngester
from ann_agents.ingestion.source_registry import SourceRegistry
from ann_agents.pipeline.assignment import assign
from ann_agents.pipeline.corroborate import related
from ann_agents.pipeline.story_pipeline import StoryPipeline


def interleave_sources(items: List[SourceItem]) -> List[SourceItem]:
    """Newest first within each source, then one from each source in turn.

    Without this the first feed in the list fills every slot in a cycle.
    """
    by_source: dict = {}
    for item in items:
        by_source.setdefault(item.source_name, []).append(item)
    queues = [sorted(group, key=lambda i: i.published_at, reverse=True) for group in by_source.values()]
    ordered: List[SourceItem] = []
    while any(queues):
        for queue in queues:
            if queue:
                ordered.append(queue.pop(0))
    return ordered


class NewsroomScheduler:
    """Orchestrates periodic ingestion and processing of the news."""

    def __init__(self):
        self.ingester = SourceIngester()
        self.pipeline = StoryPipeline()
        self.db = DatabaseBridge()
        self.search = MeilisearchSync()
        self._running = False
        self.sources = SourceRegistry(self.db.engine, self.ingester)
        self._seeded = False
        # URLs WaterSheep screened out, so later cycles don't ask again.
        self._off_topic: set = set()

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

        # Skip what an earlier cycle already ran; every rerun costs model calls.
        known = self.db.existing_urls([item.url for item in unique_items])
        unique_items = interleave_sources([item for item in unique_items if item.url not in known])
        logger.info(f"{len(unique_items)} new items, {len(known)} already in the newsroom")

        # Step 3: WaterSheep screens the feed, the language model picks the stories
        assigned = await assign(unique_items, settings.max_concurrent_stories, self._off_topic)

        # Step 4: Run pipeline on each item
        processed = 0
        for item in assigned:
            # Other outlets' reports of the same event, so the story can cite
            # more than one and the fact-check can compare them.
            others = await related(item, all_items)
            # Write from the articles, not the feeds' teasers.
            fetched = await asyncio.gather(
                *(fetch_article_text(i, settings.newsroom_min_source_chars) for i in [item, *others])
            )
            item = fetched[0]
            story = Story(
                title=item.title,
                source_items=list(fetched),
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
        """Fetch every active source in the Source table (seeded with the defaults once)."""
        if not self._seeded:
            self.sources.seed()
            self._seeded = True
        return await self.sources.fetch_all()
