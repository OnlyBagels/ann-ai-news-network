import json
from datetime import datetime, timezone

import pytest
from sqlalchemy import text

from ann_agents.bridge.db_bridge import DatabaseBridge
from ann_agents.core.config import settings
from ann_agents.core.types import Category, SourceItem, Story, StoryStatus
from ann_agents.llm import router as router_module
from ann_agents.llm.router import LLMRouter, LLMTier, extract_json_text
from ann_agents.pipeline.story_pipeline import StoryPipeline


def test_extract_json_text_handles_fences_and_preamble():
    assert json.loads(extract_json_text('```json\n{"a": 1}\n```')) == {"a": 1}
    assert json.loads(extract_json_text('Here you go:\n{"a": {"b": 2}}\nThanks')) == {"a": {"b": 2}}


def test_claude_covers_every_tier_when_it_is_the_only_key(monkeypatch):
    for key in ("deepseek", "gemini", "grok", "openai"):
        monkeypatch.setattr(settings, f"{key}_api_key", None)
    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")
    router = LLMRouter()
    for tier in LLMTier:
        provider, _ = router._resolve(tier)
        assert provider == "anthropic"
    assert router._model_for("anthropic", LLMTier.CHEAP) == settings.anthropic_cheap_model
    assert router._model_for("anthropic", LLMTier.PREMIUM) == settings.anthropic_premium_model


@pytest.mark.asyncio
async def test_no_keys_returns_none(monkeypatch):
    for key in ("deepseek", "gemini", "grok", "openai", "anthropic"):
        monkeypatch.setattr(settings, f"{key}_api_key", None)
    assert await LLMRouter().complete(LLMTier.PREMIUM, "s", "u") is None


def canned_reply(system_prompt: str) -> str:
    """A plausible JSON reply for each agent, picked from its system prompt."""
    if "Fact-Check Agent" in system_prompt:
        return json.dumps({"overall_confidence": 0.9, "source_quality": 0.8, "hallucination_risk": 0.1,
                           "verified_claims": 3, "unverified_claims": 0, "citation_count": 1})
    if "risk assessment" in system_prompt:
        return json.dumps({"risk_level": "low", "risk_factors": [], "requires_human_review": False})
    if "headline editor" in system_prompt:
        return json.dumps({"headlines": ["Lab ships a 1M context model"]})
    if "summary editor" in system_prompt:
        return json.dumps({"tl_dr": "A 1M context model.", "summary": "The model reads 1M tokens."})
    return json.dumps({"summary": "The model reads 1M tokens.", "tags": ["models"], "category": "models"})


def make_story():
    item = SourceItem(
        title="Lab ships a model with a 1M token context window",
        url="https://example.org/blog/model",
        source_name="Example Lab Blog",
        source_type="rss",
        published_at=datetime(2026, 10, 1, 15, 0),
        content="The model reads 1M tokens.",
    )
    return Story(title=item.title, source_items=[item], primary_source=item, category=Category.MODELS)


async def run_pipeline(monkeypatch, reply):
    async def fake_complete(self, tier, system_prompt, user_prompt, **kwargs):
        return reply(system_prompt)

    monkeypatch.setattr(router_module.LLMRouter, "complete", fake_complete)
    return await StoryPipeline().run_full_pipeline(make_story())


@pytest.mark.asyncio
async def test_checked_story_is_approved(monkeypatch):
    story = await run_pipeline(monkeypatch, canned_reply)
    assert story.status == StoryStatus.APPROVED
    assert story.confidence.overall_confidence == 0.9
    assert story.headline == "Lab ships a 1M context model"


@pytest.mark.asyncio
async def test_story_without_a_fact_check_waits_for_a_human(monkeypatch):
    story = await run_pipeline(monkeypatch, lambda system_prompt: None)
    assert story.confidence is None
    assert story.status == StoryStatus.NEEDS_HUMAN_REVIEW


@pytest.mark.asyncio
async def test_pipeline_output_saves_and_reviews_round_trip(monkeypatch, engine):
    monkeypatch.setattr(settings, "database_url", str(engine.url.render_as_string(hide_password=False)))
    story = await run_pipeline(monkeypatch, canned_reply)
    bridge = DatabaseBridge()

    article_id = bridge.save_story(story)
    assert article_id
    # Saving the same story again updates the row instead of failing on the unique url.
    assert bridge.save_story(story) == article_id

    with engine.connect() as conn:
        row = conn.execute(text(
            'SELECT category::text, "storyStatus"::text, "agentsInvolved", overall_confidence FROM "Article"'
        )).one()
        scores = conn.execute(text('SELECT count(*) FROM "Scores"')).scalar_one()
    assert row[0] == "models" and row[1] == "approved" and row[3] == 0.9
    assert "fact_check_agent" in row[2]
    assert scores == 1

    assert bridge.reject_article(article_id, "duplicate")
    assert bridge.approve_article(article_id, "editor")
    with engine.connect() as conn:
        reviewer = conn.execute(text('SELECT human_reviewer, "storyStatus"::text FROM "Article"')).one()
    assert reviewer == ("editor", "approved")


def test_interleave_sources_takes_turns_newest_first():
    from ann_agents.bridge.scheduler import interleave_sources

    def item(source, day):
        return SourceItem(title=f"{source} {day}", url=f"https://x/{source}/{day}", source_name=source,
                          source_type="rss", published_at=datetime(2026, 10, day))

    ordered = interleave_sources([item("a", 1), item("a", 3), item("a", 2), item("b", 1)])
    assert [i.title for i in ordered] == ["a 3", "b 1", "a 2", "a 1"]


def test_existing_urls(monkeypatch, engine):
    from conftest import insert_article

    monkeypatch.setattr(settings, "database_url", str(engine.url.render_as_string(hide_password=False)))
    insert_article(engine, "a1", "Story")
    assert DatabaseBridge().existing_urls(["https://example.org/a1", "https://example.org/nope"]) == {"https://example.org/a1"}
