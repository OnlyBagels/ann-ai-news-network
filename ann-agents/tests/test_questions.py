import json
from datetime import datetime, timezone

import pytest
from sqlalchemy import text

from ann_agents.broadcast.director import Director
from ann_agents.broadcast.lineup import load_lineup
from ann_agents.desk import questions as desk_module
from ann_agents.desk.questions import QuestionDesk
from ann_agents.llm import router as router_module
from conftest import insert_article
from test_watersheep import FakeWaterSheep


def add_question(engine, qid, question, status="received", answer=None, article_ids=()):
    with engine.begin() as conn:
        conn.execute(text("""INSERT INTO "User" (id, handle, "passwordHash") VALUES (:u, :h, 'x') ON CONFLICT DO NOTHING"""),
                     {"u": "u1", "h": "pixelfan"})
        conn.execute(
            text("""INSERT INTO "ViewerQuestion" (id, "userId", text, status, answer, "articleIds", "answeredAt")
                    VALUES (:id, 'u1', :t, CAST(:s AS "QuestionStatus"), :a, :ids, now())"""),
            {"id": qid, "t": question, "s": status, "a": answer, "ids": list(article_ids)},
        )


def row(engine, qid):
    with engine.connect() as conn:
        return conn.execute(text('SELECT status::text, reason, answer, "articleIds" FROM "ViewerQuestion" WHERE id = :id'),
                            {"id": qid}).one()


def fake_llm(monkeypatch, decide, answer=None):
    async def complete(self, tier, system_prompt, user_prompt, **kwargs):
        if "desk editor" in system_prompt:
            return json.dumps(decide)
        return json.dumps(answer or {})

    monkeypatch.setattr(router_module.LLMRouter, "complete", complete)


async def test_abusive_message_is_screened_before_any_model_call(monkeypatch, engine):
    add_question(engine, "q1", "you are all idiots and I know where the anchor lives")
    monkeypatch.setattr(desk_module, "watersheep", lambda: FakeWaterSheep(lambda ask: 0.9 if "abusive" in ask.question else 0.8))
    called = []

    async def complete(self, *a, **k):
        called.append(1)

    monkeypatch.setattr(router_module.LLMRouter, "complete", complete)
    await QuestionDesk(engine).process()
    status, reason, _, _ = row(engine, "q1")
    assert status == "screened" and "doesn't take" in reason and not called


async def test_opinion_seeking_question_is_declined_with_a_reason(monkeypatch, engine):
    add_question(engine, "q2", "Who should I vote for in the Senate race?")
    monkeypatch.setattr(desk_module, "watersheep", lambda: FakeWaterSheep(lambda ask: 0.1 if "abusive" in ask.question else 0.9))
    fake_llm(monkeypatch, {"take": False, "reason": "ANN doesn't tell people how to vote.", "search": []})
    await QuestionDesk(engine).process()
    assert row(engine, "q2")[:2] == ("declined", "ANN doesn't tell people how to vote.")


async def test_question_is_answered_from_anns_stories_only(monkeypatch, engine):
    insert_article(engine, "fed", "Fed holds rates steady", category="business",
                   summary="The Federal Reserve held its benchmark rate steady on Wednesday, Reuters reported.")
    add_question(engine, "q3", "What did the Fed decide this week?")
    monkeypatch.setattr(desk_module, "watersheep", lambda: FakeWaterSheep(lambda ask: 0.1 if "abusive" in ask.question else 0.9))
    fake_llm(monkeypatch, {"take": True, "search": ["Fed", "rates"]},
             {"answer": "The Federal Reserve held its benchmark rate steady on Wednesday, according to Reuters.", "used": [1]})
    await QuestionDesk(engine).process()
    status, _, answer, ids = row(engine, "q3")
    assert status == "answered" and "according to Reuters" in answer and ids == ["fed"]


async def test_no_matching_stories_means_no_answer(monkeypatch, engine):
    add_question(engine, "q4", "What happened at the Olympics curling final?")
    monkeypatch.setattr(desk_module, "watersheep", lambda: None)
    fake_llm(monkeypatch, {"take": True, "search": ["curling"]})
    await QuestionDesk(engine).process()
    assert row(engine, "q4")[0] == "declined"


@pytest.mark.asyncio
async def test_director_reads_an_answered_question_on_air(store, engine):
    insert_article(engine, "fed", "Fed holds rates steady", category="business", summary="Rates held. " * 5)
    add_question(engine, "q5", "What did the Fed decide?", status="answered",
                 answer="The Fed held rates steady, Reuters reported. Officials meet again in six weeks.", article_ids=["fed"])
    d = Director(store, load_lineup(), None, lookahead_seconds=600, always_on=True)
    when = datetime(2026, 10, 2, 16, 40, tzinfo=timezone.utc)  # 12:40 PM Eastern: no show open or data hit due
    result = await d.tick(when)
    assert result.segment.kind == "question"
    assert result.segment.lines[0].text == "A question from a viewer, pixelfan: What did the Fed decide?"
    assert [a.id for a in result.segment.articles] == ["fed"]
    assert row(engine, "q5")[0] == "aired"
