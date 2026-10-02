"""Beat routing: WaterSheep picks the beat, the beat picks the reporter and byline."""

from sqlalchemy import text

from ann_agents.bridge.db_bridge import DatabaseBridge
from ann_agents.broadcast.lineup import load_lineup, reporter_for
from ann_agents.core.config import settings
from ann_agents.core.types import AgentRole, Category
from ann_agents.llm import router as router_module
from ann_agents.llm.watersheep import Answer
from ann_agents.pipeline import beat as beat_module
from ann_agents.pipeline.story_pipeline import StoryPipeline
from test_pipeline import canned_reply, make_story


class ChoosingWaterSheep:
    """Answers the section question with `section` and the AI-beat question with
    `ai_beat`, at the given confidence."""

    def __init__(self, section, ai_beat=None, confidence=0.9):
        self.section, self.ai_beat, self.confidence = section, ai_beat, confidence

    def ask(self, text, question, options=None, type=None):
        choice = self.section if question == beat_module.SECTION_QUESTION else self.ai_beat
        rest = (1 - self.confidence) / (len(options) - 1)
        probs = {o: (self.confidence if o == choice else rest) for o in options}
        return Answer("single", probs, choice, self.confidence)


AI = "artificial intelligence"


def test_every_beat_has_a_reporter_with_a_voice():
    lineup = load_lineup()
    for beat in beat_module.REPORTER_ROLE:
        reporter = reporter_for(lineup, beat)
        assert reporter is not None, beat
        assert reporter.voice and reporter.bio and reporter.style
    covered = set(beat_module.AI_BEATS.values()) | (set(beat_module.SECTIONS.values()) - {"ai"})
    assert covered == {c.value for c in Category}
    for category in covered:
        assert reporter_for(lineup, category) is not None, category


async def test_watersheep_beat_wins_when_confident(monkeypatch):
    monkeypatch.setattr(beat_module, "watersheep", lambda: ChoosingWaterSheep(AI, "AI security"))
    story = make_story()
    story.primary_source.metadata["category_hint"] = "politics"
    assert await beat_module.assign_beat(story) == "security"


async def test_source_hint_wins_when_watersheep_is_unsure(monkeypatch):
    monkeypatch.setattr(beat_module, "watersheep", lambda: ChoosingWaterSheep(AI, "AI security", 0.2))
    story = make_story()
    story.primary_source.metadata["category_hint"] = "research"
    assert await beat_module.assign_beat(story) == "research"


async def test_no_watersheep_and_no_hint_leaves_the_beat_open(monkeypatch):
    monkeypatch.setattr(beat_module, "watersheep", lambda: None)
    assert await beat_module.assign_beat(make_story()) is None


async def run_lean(monkeypatch, choice, section=AI):
    systems, users = [], []

    async def fake_complete(self, tier, system_prompt, user_prompt, **kwargs):
        systems.append(system_prompt)
        users.append(user_prompt)
        return canned_reply(system_prompt)

    monkeypatch.setattr(router_module.LLMRouter, "complete", fake_complete)
    monkeypatch.setattr(beat_module, "watersheep", lambda: ChoosingWaterSheep(section, choice))
    story = await StoryPipeline(lean=True).run_full_pipeline(make_story())
    return story, systems, users


async def test_lean_pipeline_runs_only_the_beat_reporter(monkeypatch):
    story, systems, users = await run_lean(monkeypatch, "AI security")
    # The reporter said "models"; WaterSheep's beat stands.
    assert story.category == Category.SECURITY
    assert story.byline == "sam"
    reporters = [s for s in systems if "Reporter for ANN" in s]
    assert len(reporters) == 1 and "Security Reporter" in reporters[0]
    assert AgentRole.SECURITY_REPORTER in story.agents_involved
    assert AgentRole.MODEL_REPORTER not in story.agents_involved
    assert len(systems) == 5
    note = next(u for u, s in zip(users, systems) if "Security Reporter" in s)
    assert "writing as Sam Albright" in note and "must come from the source text" in note


async def test_byline_follows_the_reporter_category_without_watersheep(monkeypatch):
    monkeypatch.setattr(beat_module, "watersheep", lambda: None)

    async def fake_complete(self, tier, system_prompt, user_prompt, **kwargs):
        return canned_reply(system_prompt)

    monkeypatch.setattr(router_module.LLMRouter, "complete", fake_complete)
    story = await StoryPipeline(lean=True).run_full_pipeline(make_story())
    assert story.category == Category.MODELS and story.byline == "tomas"


async def test_byline_and_judge_are_saved(monkeypatch, engine):
    monkeypatch.setattr(settings, "database_url", str(engine.url.render_as_string(hide_password=False)))
    story, _, _ = await run_lean(monkeypatch, "open source AI")
    story.judge = {"relevance": 0.97, "clickbait": 0.04}
    DatabaseBridge().save_story(story)
    with engine.connect() as conn:
        row = conn.execute(text('SELECT byline, judge, category::text FROM "Article"')).one()
    assert row == ("ada", {"relevance": 0.97, "clickbait": 0.04}, "open_source")


async def test_general_news_goes_to_the_section_reporter(monkeypatch):
    story, systems, users = await run_lean(monkeypatch, None, section="sports")
    assert story.category == Category.SPORTS
    assert story.byline == "danny"
    reporters = [s for s in systems if "reporter for ANN" in s or "Reporter for ANN" in s]
    assert len(reporters) == 1 and "Your beat is sports" in reporters[0]
    assert "Attribute every factual claim" in reporters[0]
    assert AgentRole.BEAT_REPORTER in story.agents_involved


async def test_ai_story_from_a_source_with_an_ai_hint_keeps_the_hint(monkeypatch):
    monkeypatch.setattr(beat_module, "watersheep", lambda: ChoosingWaterSheep(AI, "AI agents"))
    story = make_story()
    story.primary_source.metadata["category_hint"] = "research"
    assert await beat_module.assign_beat(story) == "research"


async def test_every_source_is_saved_with_its_outlet_and_lean(monkeypatch, engine):
    from datetime import datetime
    from ann_agents.core.types import SourceItem

    monkeypatch.setattr(settings, "database_url", str(engine.url.render_as_string(hide_password=False)))
    story, _, _ = await run_lean(monkeypatch, None, section="world news outside the United States")
    story.primary_source.metadata["lean"] = "center"
    second = SourceItem(title="Same event, another outlet", url="https://example.net/b", source_name="Other Outlet",
                        source_type="rss", published_at=datetime(2026, 10, 1, 16, 0), metadata={"lean": "center-right"})
    story.source_items = [story.primary_source, second]
    DatabaseBridge().save_story(story)
    with engine.connect() as conn:
        sources = conn.execute(text('SELECT sources FROM "Article"')).scalar_one()
    assert [(s["name"], s["lean"]) for s in sources] == [("Example Lab Blog", "center"), ("Other Outlet", "center-right")]
    assert sources[1]["url"] == "https://example.net/b"
