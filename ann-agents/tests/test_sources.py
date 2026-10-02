from sqlalchemy import text

from ann_agents.core.types import SourceItem
from ann_agents.ingestion.source_registry import SourceRegistry
from datetime import datetime


class FakeIngester:
    def __init__(self, fail_urls=()):
        self.fail_urls = set(fail_urls)

    async def fetch_feed(self, url, name, limit):
        if url in self.fail_urls:
            raise ConnectionError("404 Not Found")
        return [SourceItem(title=f"{name} story", url=f"{url}/1", source_name="whatever the feed calls itself",
                           source_type="rss", published_at=datetime(2026, 10, 1))]

    async def ingest_hn(self, top_n=30):
        return []


def health(engine):
    with engine.connect() as conn:
        rows = conn.execute(text(
            'SELECT name, "lastItemCount", "lastError", failures, "lastSuccessAt" IS NOT NULL FROM "Source" ORDER BY name'
        )).fetchall()
    return {r[0]: r[1:] for r in rows}


async def test_seed_adds_defaults_once_and_respects_edits(engine):
    registry = SourceRegistry(engine, FakeIngester())
    defaults = [("Lab Blog", "rss", "https://lab/rss", "models", True), ("Other", "rss", "https://other/rss", None, False)]
    assert registry.seed(defaults) == 2
    with engine.begin() as conn:
        conn.execute(text('UPDATE "Source" SET "isActive" = false WHERE name = \'Other\''))
    assert registry.seed(defaults) == 0
    assert [s.name for s in registry.active()] == ["Lab Blog"]


async def test_fetch_all_records_health_and_tags_items(engine):
    registry = SourceRegistry(engine, FakeIngester(fail_urls={"https://dead/rss"}))
    registry.seed([
        ("Lab Blog", "rss", "https://lab/rss", "models", True),
        ("Dead Feed", "rss", "https://dead/rss", None, False),
        ("Hacker News", "hackernews", "https://news.ycombinator.com", None, False),
    ])
    items = await registry.fetch_all()

    assert [i.source_name for i in items] == ["Lab Blog"]
    assert items[0].metadata["ai_only"] is True and items[0].metadata["category_hint"] == "models"
    h = health(engine)
    assert h["Lab Blog"] == (1, None, 0, True)
    assert h["Dead Feed"][1].startswith("ConnectionError: 404") and h["Dead Feed"][2] == 1
    assert h["Hacker News"][1] == "RuntimeError: returned no items"

    await registry.fetch_all()
    assert health(engine)["Dead Feed"][2] == 2  # failures in a row
