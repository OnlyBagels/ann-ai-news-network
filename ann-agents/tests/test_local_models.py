import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from sqlalchemy import text

from ann_agents.broadcast.director import Director
from ann_agents.broadcast.lineup import load_lineup
from ann_agents.broadcast.models import DeskReview, DraftLine, DraftScript, LineVerdict
from ann_agents.broadcast.writer import DESK_SYSTEM, LocalNewsroom
from ann_agents.core.config import settings
from ann_agents.llm import local as local_module
from ann_agents.llm.local import LocalModelPool, LocalReply, parse_urls
from ann_agents.llm.router import LLMRouter, LLMTier
from conftest import insert_article

NOW = datetime(2026, 10, 2, 14, 30, tzinfo=timezone.utc)  # Model Watch: oscar, marla
SUMMARY = "The model reads 1M tokens. Pricing is $0.28 per million input tokens."

SCRIPT = DraftScript(title="Lab ships a 1M context model", lines=[
    # The small-model slips tidy_line repairs: a name for a speaker, a citation note in the text.
    DraftLine(speaker="Oscar", text="Example Lab Blog says its model reads 1M tokens [Fact 5].", fact_ids=[1, 2, 5]),
    DraftLine(speaker="marla", text="What does it cost?", fact_ids=[]),
    DraftLine(speaker="oscar", text="Pricing is $0.28 per million input tokens.", fact_ids=[6]),
])


class FakePool:
    """Answers like an OpenAI-compatible server: the writer gets a script, the desk a review."""

    def __init__(self, delay=0.0):
        self.urls = ["http://cpu-1:11434/v1"]
        self.delay = delay
        self.calls = []

    async def chat(self, model, system, user, max_tokens=2000, temperature=0.4, response_format=None):
        self.calls.append((model, response_format["json_schema"]["name"]))
        await asyncio.sleep(self.delay)
        if system == DESK_SYSTEM:
            body = DeskReview(verdicts=[LineVerdict(index=i, supported=True, reason="") for i in range(3)])
        else:
            body = SCRIPT
        return LocalReply(text=body.model_dump_json(), input_tokens=900, output_tokens=150, server=self.urls[0])


def director(store, room, **kw):
    return Director(store, load_lineup(), room, **kw)


def segments(engine):
    with engine.connect() as conn:
        return conn.execute(text(
            'SELECT kind, writer, "costUsd", "startsAt", "endsAt", "articleIds", script FROM "BroadcastSegment" ORDER BY "startsAt"'
        )).fetchall()


async def test_local_models_write_and_check_a_segment_for_free(store, engine):
    insert_article(engine, "a1", "Lab ships a model with a 1M token context window", summary=SUMMARY)
    store.check_in("v", "web", NOW)
    pool = FakePool()
    result = await director(store, LocalNewsroom(pool, "qwen2.5:7b", "qwen2.5:14b")).tick(NOW)

    assert result.segment.kind == "story"
    assert [c for c in pool.calls] == [("qwen2.5:7b", "DraftScript"), ("qwen2.5:14b", "DeskReview")]
    [row] = segments(engine)
    assert row.writer == "local:qwen2.5:7b" and row.costUsd == 0
    lines = row.script["lines"]
    assert lines[0]["speaker"] == "oscar"
    assert lines[0]["text"] == "Example Lab Blog says its model reads 1M tokens."
    with engine.connect() as conn:
        spend = conn.execute(text('SELECT usd, calls, "outputTokens" FROM "BroadcastSpend"')).one()
    assert spend == (0.0, 2, 300)


async def test_short_runway_airs_a_headline_read_instead_of_waiting(store, engine):
    insert_article(engine, "a1", "Lab ships a model", summary=SUMMARY)
    store.check_in("v", "web", NOW)
    pool = FakePool()
    result = await director(store, LocalNewsroom(pool, "m", "m"), min_runway_seconds=60).tick(NOW)
    assert result.segment.kind == "reel" and pool.calls == []


async def test_slow_model_times_out_to_a_headline_read(store, engine):
    insert_article(engine, "a1", "Lab ships a model", summary=SUMMARY)
    store.check_in("v", "web", NOW)
    result = await director(store, LocalNewsroom(FakePool(delay=1.0), "m", "m"), write_timeout_seconds=0.1).tick(NOW)
    assert result.segment.kind == "reel"


async def test_parallel_writers_take_different_stories_and_never_overlap(store, engine):
    for i in range(4):
        insert_article(engine, f"a{i}", f"Story {i} with a 1M token window", summary=SUMMARY)
    store.check_in("v", "web", NOW)
    d = director(store, LocalNewsroom(FakePool(delay=0.05), "m", "m"), lookahead_seconds=600)
    await asyncio.gather(*(d.tick(NOW) for _ in range(4)))

    rows = segments(engine)
    assert len(rows) == 4
    aired = [a for r in rows for a in r.articleIds]
    assert len(set(aired)) == 4
    for before, after in zip(rows, rows[1:]):
        assert after.startsAt == before.endsAt


def test_parse_urls():
    assert parse_urls(" http://a:11434/v1/, http://b:8080/v1 ,") == ["http://a:11434/v1", "http://b:8080/v1"]
    assert parse_urls(None) == []


async def test_pool_rotates_and_skips_a_dead_server():
    seen = []

    def factory(url):
        async def create(**kwargs):
            seen.append(url)
            if "dead" in url:
                raise ConnectionError("refused")
            usage = SimpleNamespace(prompt_tokens=10, completion_tokens=5)
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content="ok"))], usage=usage)

        return SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))

    pool = LocalModelPool(["http://dead:1/v1", "http://live:2/v1"], client_factory=factory)
    first = await pool.chat("m", "s", "u")
    second = await pool.chat("m", "s", "u")
    assert first.server == second.server == "http://live:2/v1"
    assert seen == ["http://dead:1/v1", "http://live:2/v1", "http://live:2/v1"]


def test_router_puts_local_first_for_configured_tiers(monkeypatch):
    monkeypatch.setattr(settings, "local_llm_base_urls", "http://cpu-1:11434/v1")
    monkeypatch.setattr(settings, "local_llm_tiers", "cheap,social")
    monkeypatch.setattr(settings, "anthropic_api_key", "k")
    monkeypatch.setattr(local_module, "_pool", None)
    router = LLMRouter()
    assert router._resolve(LLMTier.CHEAP)[0] == "local"
    assert router._resolve(LLMTier.PREMIUM)[0] == "anthropic"
    monkeypatch.setattr(local_module, "_pool", None)


async def test_split_newsroom_writes_on_one_backend_and_checks_on_another(store, engine):
    from ann_agents.broadcast.writer import SplitNewsroom

    insert_article(engine, "a1", "Lab ships a model with a 1M token context window", summary=SUMMARY)
    store.check_in("v", "web", NOW)
    writer_pool, desk_pool = FakePool(), FakePool()
    room = SplitNewsroom(LocalNewsroom(writer_pool, "small", "small"), LocalNewsroom(desk_pool, "big", "big"))
    result = await director(store, room).tick(NOW)
    assert result.segment.kind == "story"
    assert writer_pool.calls == [("small", "DraftScript")]
    assert desk_pool.calls == [("big", "DeskReview")]
