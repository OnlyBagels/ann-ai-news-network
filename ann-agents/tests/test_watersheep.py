import os
from datetime import datetime, timezone
from pathlib import Path

import pytest
from sqlalchemy import text

from ann_agents.broadcast.director import Director
from ann_agents.broadcast.lineup import load_lineup
from ann_agents.broadcast.writer import LocalNewsroom
from ann_agents.core.config import settings
from ann_agents.core.types import SourceItem, StoryStatus
from ann_agents.llm import router as router_module
from ann_agents.llm.watersheep import Answer, WaterSheep
from ann_agents.oversight import watersheep_judge
from ann_agents.pipeline import assignment
from ann_agents.pipeline.story_pipeline import StoryPipeline
from conftest import insert_article
from test_local_models import FakePool, SUMMARY
from test_pipeline import canned_reply, make_story

MODEL_DIR = Path(os.environ.get("WATERSHEEP_TEST_DIR", Path(__file__).resolve().parents[2] / "models" / "watersheep"))


class FakeWaterSheep:
    """Answers yes with a probability chosen per question by `rule(ask)`."""

    name = "fake-watersheep"

    def __init__(self, rule):
        self.rule = rule
        self.asked = []

    def ask_many(self, asks):
        self.asked.extend(asks)
        out = []
        for ask in asks:
            p = self.rule(ask)
            out.append(Answer("binary", {"yes": p, "no": 1 - p}, "yes" if p >= 0.5 else "no", max(p, 1 - p)))
        return out


@pytest.mark.skipif(not (MODEL_DIR / "onnx" / "model_quantized.onnx").exists(), reason="WaterSheep not downloaded")
def test_real_model_answers_the_model_card_example():
    ws = WaterSheep(str(MODEL_DIR))
    answer = ws.ask("I was charged twice.", "Which team should handle this?", ["billing", "shipping", "support"])
    assert answer.answer == "billing"
    assert abs(sum(answer.probs.values()) - 1) < 1e-6
    question = "Is this about artificial intelligence or machine learning?"
    assert ws.ask("OpenAI releases a new language model for coding agents", question).p_yes > 0.5
    assert ws.ask("Best pizza places in Brooklyn", question).p_yes < 0.5


def item(title, source="Feed", day=1):
    return SourceItem(title=title, url=f"https://x/{title}", source_name=source, source_type="rss",
                      published_at=datetime(2026, 10, day), summary="")


async def test_screen_drops_off_topic_items_and_remembers_them(monkeypatch):
    ws = FakeWaterSheep(lambda ask: 0.9 if "model" in ask.text else 0.1)
    monkeypatch.setattr(assignment, "watersheep", lambda: ws)
    off_topic = set()
    kept = await assignment.screen([item("New model ships"), item("Pizza review")], off_topic)
    assert [i.title for i in kept] == ["New model ships"]
    assert off_topic == {"https://x/Pizza review"}
    assert kept[0].metadata["watersheep_relevance"] == 0.9
    # A later cycle doesn't ask about the pizza again.
    await assignment.screen([item("Pizza review")], off_topic)
    assert len(ws.asked) == 2
    # AI-only feeds pass without a question: WaterSheep doesn't know Mistral is AI.
    trusted = await assignment.screen([item("Small 4 weights released", source="Mistral AI")], off_topic)
    assert len(trusted) == 1 and len(ws.asked) == 2


async def test_editor_pick_uses_the_models_choice_and_survives_bad_replies(monkeypatch):
    items = [item(f"Story {n}") for n in range(1, 6)]

    async def picks(self, tier, system_prompt, user_prompt, **kwargs):
        return '{"picks": [3, 99, 1, 3]}'

    monkeypatch.setattr(router_module.LLMRouter, "complete", picks)
    chosen = await assignment.editor_pick(items, 2)
    assert [i.title for i in chosen] == ["Story 3", "Story 1"]

    async def junk(self, tier, system_prompt, user_prompt, **kwargs):
        return "not json"

    monkeypatch.setattr(router_module.LLMRouter, "complete", junk)
    assert [i.title for i in await assignment.editor_pick(items, 2)] == ["Story 1", "Story 2"]


async def run_with_judge(monkeypatch, rule):
    monkeypatch.setattr(watersheep_judge, "watersheep", lambda: FakeWaterSheep(rule))

    async def fake_complete(self, tier, system_prompt, user_prompt, **kwargs):
        return canned_reply(system_prompt)

    monkeypatch.setattr(router_module.LLMRouter, "complete", fake_complete)
    return await StoryPipeline(lean=True).run_full_pipeline(make_story())


async def test_story_publishes_only_when_watersheep_and_the_model_agree(monkeypatch):
    story = await run_with_judge(monkeypatch, lambda ask: 0.05 if "clickbait" in ask.question else 0.9)
    assert story.status == StoryStatus.APPROVED
    assert story.judge == {"relevance": 0.9, "clickbait": 0.05, "support": 0.9}
    judge_action = next(a for a in story.agent_actions if a.agent_role == "watersheep_judge")
    assert judge_action.output["model"] == "fake-watersheep"


async def test_weak_support_sends_the_story_to_a_person(monkeypatch):
    story = await run_with_judge(
        monkeypatch, lambda ask: 0.2 if "supported" in ask.question else 0.05 if "clickbait" in ask.question else 0.9
    )
    assert story.status == StoryStatus.NEEDS_HUMAN_REVIEW
    assert any("summary support 0.20" in f for f in story.risk.risk_factors)


async def test_off_topic_story_is_rejected(monkeypatch):
    story = await run_with_judge(monkeypatch, lambda ask: 0.1 if "artificial" in ask.question else 0.05)
    assert story.status == StoryStatus.REJECTED


async def test_director_cuts_lines_watersheep_doubts(store, engine):
    insert_article(engine, "a1", "Lab ships a model with a 1M token context window", summary=SUMMARY)
    now = datetime(2026, 10, 2, 14, 30, tzinfo=timezone.utc)
    store.check_in("v", "web", now)
    # Doubt the pricing line only; questions and reactions (no facts cited) aren't asked about.
    ws = FakeWaterSheep(lambda ask: 0.2 if "0.28" in ask.text.split("Statement:")[1] else 0.9)
    d = Director(store, load_lineup(), LocalNewsroom(FakePool(), "m", "m"), watersheep=ws, min_support=0.5)
    result = await d.tick(now)

    assert len(ws.asked) == 2  # the two lines that cite facts
    with engine.connect() as conn:
        script = conn.execute(text('SELECT script FROM "BroadcastSegment"')).scalar_one()
    stages = {d["stage"]: d["reason"] for d in script["dropped"]}
    assert stages["watersheep"] == "WaterSheep gives 0.20 that the facts support it"
    # Two of three lines left with one citing the story: still airs as dialogue.
    assert result.segment.kind == "story"


async def test_story_from_a_bare_headline_goes_to_a_person(monkeypatch):
    async def fake_complete(self, tier, system_prompt, user_prompt, **kwargs):
        return canned_reply(system_prompt)

    monkeypatch.setattr(router_module.LLMRouter, "complete", fake_complete)
    monkeypatch.setattr(watersheep_judge, "watersheep", lambda: None)
    story = make_story()
    story.primary_source.content = None
    story.primary_source.summary = ""
    result = await StoryPipeline(lean=True).run_full_pipeline(story)
    assert result.status == StoryStatus.NEEDS_HUMAN_REVIEW
    assert any("too thin to check" in f for f in result.risk.risk_factors)


async def test_article_text_is_fetched_when_the_feed_is_thin(monkeypatch):
    from ann_agents.ingestion import article_text

    paragraphs = "".join(
        f"<p>Paragraph {n}: the lab released the model today with open weights and a {n}-page report.</p>" for n in range(12)
    )
    page = f"<html><body><article><h1>Model ships</h1>{paragraphs}</article></body></html>"

    class FakeClient:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def get(self, url, headers=None):
            import httpx

            return httpx.Response(200, text=page, request=httpx.Request("GET", url))

    monkeypatch.setattr(article_text.httpx, "AsyncClient", FakeClient)
    thin = item("Model ships")
    filled = await article_text.fetch_article_text(thin, min_chars=400)
    assert "open weights" in filled.content and filled.metadata["article_text"] == "fetched"
    assert len(article_text.source_text(filled)) >= 400
