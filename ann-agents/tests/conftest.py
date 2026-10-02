"""Shared fixtures.

Database tests need a Postgres with the Prisma schema applied
(`cd ann-web && npx prisma db push`) and TEST_DATABASE_URL pointing at it.
They are skipped otherwise. Every test starts from empty tables.
"""

import os
from types import SimpleNamespace

import pytest
from sqlalchemy import text

from ann_agents.core.db import make_engine

TABLES = ['"Source"', '"BroadcastSegment"', '"BroadcastSpend"', '"LiveViewer"', '"AgentAction"', '"Scores"', '"Article"']


@pytest.fixture
def engine():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL is not set")
    engine = make_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(text(f"TRUNCATE {', '.join(TABLES)} CASCADE"))
    except Exception as e:  # schema not pushed, server down
        pytest.skip(f"test database unavailable: {e}")
    yield engine
    engine.dispose()


@pytest.fixture
def store(engine):
    from ann_agents.broadcast.store import BroadcastStore

    return BroadcastStore(engine)


def insert_article(engine, id, title, category="models", status="approved", score=50, published_at=None,
                   summary="", tl_dr=None, source="Example Lab Blog"):
    from datetime import datetime, timezone

    with engine.begin() as conn:
        conn.execute(
            text("""
                INSERT INTO "Article" (id, title, slug, url, source, "publishedAt", summary, "tlDr", tags,
                    category, "storyStatus", "relatedArticles", "createdAt", "updatedAt")
                VALUES (:id, :title, :id, :url, :source, :published, :summary, :tl_dr, '{}',
                    CAST(:category AS "Category"), CAST(:status AS "StoryStatus"), '{}', now(), now())
            """),
            {
                "id": id, "title": title, "url": f"https://example.org/{id}", "source": source,
                "published": published_at or datetime.now(timezone.utc), "summary": summary,
                "tl_dr": tl_dr, "category": category, "status": status,
            },
        )
        conn.execute(
            text("""INSERT INTO "Scores" (id, "articleId", "overallScore") VALUES (:sid, :id, :score)"""),
            {"sid": f"s-{id}", "id": id, "score": score},
        )


class FakeMessages:
    """Stands in for client.beta.messages: returns queued parsed outputs in order."""

    def __init__(self, outputs):
        self.outputs = list(outputs)
        self.calls = []

    async def parse(self, **kwargs):
        self.calls.append(kwargs)
        output = self.outputs.pop(0)
        if isinstance(output, Exception):
            raise output
        usage = SimpleNamespace(input_tokens=1000, output_tokens=200,
                                cache_creation_input_tokens=0, cache_read_input_tokens=0)
        stop = "refusal" if output == "refusal" else "end_turn"
        parsed = None if output == "refusal" else output
        return SimpleNamespace(parsed_output=parsed, usage=usage, stop_reason=stop, model=kwargs["model"])


def fake_client(outputs):
    messages = FakeMessages(outputs)
    return SimpleNamespace(beta=SimpleNamespace(messages=messages)), messages
