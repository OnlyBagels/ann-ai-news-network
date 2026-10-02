from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text

from ann_agents.broadcast.director import Director
from ann_agents.broadcast.lineup import load_lineup
from ann_agents.broadcast.models import DeskReview, DraftLine, DraftScript, LineVerdict
from ann_agents.broadcast.writer import ClaudeNewsroom
from conftest import fake_client, insert_article

# 14:30 UTC: Model Watch (oscar, marla), past the show-open window.
NOW = datetime(2026, 10, 2, 14, 30, tzinfo=timezone.utc)

SUMMARY = "The model reads 1M tokens. Pricing is $0.28 per million input tokens."


def newsroom(outputs):
    client, messages = fake_client(outputs)
    return ClaudeNewsroom(client, "claude-haiku-4-5", "claude-sonnet-5-5", "claude-sonnet-5-5"), messages


def director(store, room=None, **kw):
    return Director(store, load_lineup(), room, lookahead_seconds=150, **kw)


def script(*lines, title="Lab ships a 1M context model"):
    return DraftScript(title=title, lines=[DraftLine(speaker=s, text=t, fact_ids=ids) for s, t, ids in lines])


def all_supported(n):
    return DeskReview(verdicts=[LineVerdict(index=i, supported=True, reason="") for i in range(n)])


def rows(engine):
    with engine.connect() as conn:
        return conn.execute(text(
            'SELECT kind, writer, "startsAt", "endsAt", script, "articleIds" FROM "BroadcastSegment" ORDER BY "startsAt"'
        )).fetchall()


@pytest.mark.asyncio
async def test_nobody_watching_writes_nothing(store, engine):
    insert_article(engine, "a1", "Lab ships a model with a 1M token context window", summary=SUMMARY)
    room, messages = newsroom([])
    result = await director(store, room).tick(NOW)
    assert result.action == "idle"
    assert rows(engine) == [] and messages.calls == []


@pytest.mark.asyncio
async def test_written_segment_airs_after_both_checks(store, engine):
    insert_article(engine, "a1", "Lab ships a model with a 1M token context window", summary=SUMMARY)
    store.check_in("viewer-1", "web", NOW)
    lines = [
        ("oscar", "Example Lab Blog says its new model reads 1M tokens.", [1, 2, 5]),
        ("marla", "And the price?", []),
        ("oscar", "Pricing is $0.28 per million input tokens.", [6]),
        ("marla", "Cheap enough that people will actually try it.", []),
    ]
    room, messages = newsroom([script(*lines), all_supported(4)])

    result = await director(store, room).tick(NOW)

    assert result.action == "booked" and result.segment.kind == "story"
    assert [m["model"] for m in messages.calls] == ["claude-haiku-4-5", "claude-sonnet-5-5"]
    # The Sonnet call opts into the server-side refusal fallback; Haiku doesn't take it.
    assert messages.calls[1]["fallbacks"] == "default" and "fallbacks" not in messages.calls[0]
    [row] = rows(engine)
    assert row.kind == "story" and row.writer == "claude-haiku-4-5" and row.articleIds == ["a1"]
    assert [l["text"] for l in row.script["lines"]] == [t for _, t, _ in lines]
    assert row.script["lines"][1]["startMs"] > 0
    with engine.connect() as conn:
        spent = conn.execute(text('SELECT usd, calls FROM "BroadcastSpend"')).fetchone()
    assert spent.calls == 2 and spent.usd > 0


@pytest.mark.asyncio
async def test_unsourced_lines_are_cut_and_bad_scripts_fall_back_to_the_article(store, engine):
    insert_article(engine, "a1", "Lab ships a model with a 1M token context window", summary=SUMMARY)
    store.check_in("viewer-1", "web", NOW)
    lines = [
        ("oscar", "It reads 2M tokens, double the old one.", [5]),  # wrong figure: rules cut it
        ("marla", "It costs $0.28 per million input tokens.", [6]),
        ("oscar", "And it beat every rival on every benchmark.", []),  # unsupported: desk cuts it
    ]
    desk = DeskReview(verdicts=[
        LineVerdict(index=0, supported=True, reason=""),
        LineVerdict(index=1, supported=False, reason="no benchmark results in the facts"),
    ])
    room, _ = newsroom([script(*lines), desk])

    result = await director(store, room).tick(NOW)

    assert result.segment.kind == "reel"
    [row] = rows(engine)
    assert row.writer == "reel"
    assert row.script["lines"][0]["text"] == "From Example Lab Blog: Lab ships a model with a 1M token context window."
    reasons = {d["stage"]: d["reason"] for d in row.script["dropped"]}
    assert "not in the cited facts" in reasons["rules"]
    assert reasons["desk"] == "no benchmark results in the facts"


@pytest.mark.asyncio
async def test_refusal_and_errors_fall_back_to_a_headline_read(store, engine):
    insert_article(engine, "a1", "First story", summary=SUMMARY)
    insert_article(engine, "a2", "Second story", summary=SUMMARY)
    store.check_in("viewer-1", "web", NOW)
    room, _ = newsroom(["refusal", RuntimeError("overloaded")])
    d = director(store, room)
    first = await d.tick(NOW)
    second = await d.tick(NOW)
    assert first.segment.kind == "reel" and second.segment.kind == "reel"


@pytest.mark.asyncio
async def test_spent_budget_means_headline_reads_only(store, engine):
    insert_article(engine, "a1", "Lab ships a model", summary=SUMMARY)
    store.check_in("viewer-1", "web", NOW)
    with engine.begin() as conn:
        conn.execute(text("""INSERT INTO "BroadcastSpend" (day, usd) VALUES ('2026-10-02', 5.0)"""))
    room, messages = newsroom([])
    result = await director(store, room, daily_budget_usd=5.0).tick(NOW)
    assert result.segment.kind == "reel" and messages.calls == []


@pytest.mark.asyncio
async def test_timeline_is_contiguous_and_stops_at_the_lookahead(store, engine):
    for i in range(30):
        insert_article(engine, f"a{i}", f"Story number {i}", summary=SUMMARY)
    store.check_in("viewer-1", "web", NOW)
    d = director(store, None)
    actions = []
    for _ in range(30):
        actions.append((await d.tick(NOW)).action)
    assert actions[-1] == "full"
    segments = rows(engine)
    for before, after in zip(segments, segments[1:]):
        assert after.startsAt == before.endsAt
    assert segments[-1].startsAt.replace(tzinfo=timezone.utc) - NOW < timedelta(seconds=150)
    # Nothing airs twice inside the cooldown.
    aired = [a for r in segments for a in r.articleIds]
    assert len(aired) == len(set(aired))


@pytest.mark.asyncio
async def test_show_open_airs_at_the_top_of_a_slot(store, engine):
    insert_article(engine, "a1", "Lab ships a model", summary=SUMMARY)
    store.check_in("viewer-1", "web", NOW)
    top = datetime(2026, 10, 2, 14, 1, tzinfo=timezone.utc)
    d = director(store, None)
    first = await d.tick(top)
    second = await d.tick(top)
    assert first.segment.kind == "ident" and first.segment.title == "Model Watch"
    assert second.segment.kind == "reel"


@pytest.mark.asyncio
async def test_only_approved_stories_air(store, engine):
    insert_article(engine, "bad", "Unchecked story", status="needs_human_review")
    store.check_in("viewer-1", "web", NOW)
    result = await director(store, None).tick(NOW)
    assert result.action == "empty"
