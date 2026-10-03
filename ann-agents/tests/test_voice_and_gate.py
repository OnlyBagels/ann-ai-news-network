from ann_agents.core.types import ConfidenceScore, RiskAssessment, RiskLevel, Story, StoryStatus
from ann_agents.core.voice import detect_slop
from ann_agents.oversight.oversight_agents import EditorInChief
from ann_agents.pipeline.story_pipeline import StoryPipeline
from ann_agents.reporters.rules import ARTICLE_RULES


def test_detect_slop_matches_whole_phrases_only():
    hits = dict(detect_slop("The firm leverages a robust, cutting-edge stack."))
    assert set(hits) == {"leverages", "robust", "cutting-edge"}
    assert detect_slop("The robustness of the bridge was tested.") == []
    assert detect_slop("") == []


def test_reporters_are_told_the_banned_phrases():
    assert '"leverages"' in ARTICLE_RULES
    assert ARTICLE_RULES.rstrip().endswith('"key_points": [str]}')


def test_style_hits_are_noted_without_holding_the_story():
    story = Story(title="t", headline="A groundbreaking deal", summary="It is basically done.")
    StoryPipeline(lean=True)._flag_style(story)
    assert story.risk.requires_human_review is False
    assert any("groundbreaking" in f and "basically" in f for f in story.risk.risk_factors)


def test_risk_from_every_oversight_agent_survives_the_merge():
    risk = RiskAssessment(risk_level=RiskLevel.MEDIUM, risk_factors=["unverified leak"])
    legal = RiskAssessment(legal_concerns=["quotes a sealed filing"], requires_human_review=True)
    merged = StoryPipeline._merge_risk(StoryPipeline._merge_risk(None, risk), legal)
    assert merged.risk_level == RiskLevel.MEDIUM
    assert merged.requires_human_review is True
    assert merged.risk_factors == ["unverified leak"]
    assert merged.legal_concerns == ["quotes a sealed filing"]


def _judged_story(confidence: float, support: float) -> Story:
    story = Story(title="t", summary="s", agents_involved=["beat_reporter"])
    story.confidence = ConfidenceScore(overall_confidence=confidence, hallucination_risk=0.1,
                                       verified_claims=2, citation_count=1)
    story.judge = {"relevance": 0.99, "support": support, "clickbait": 0.0, "loaded": 0.0}
    return story


async def _decide(story: Story, monkeypatch) -> Story:
    from ann_agents.core.config import settings

    monkeypatch.setattr(settings, "newsroom_min_source_chars", 0)
    monkeypatch.setattr(settings, "watersheep_min_support", 0.5)
    return await EditorInChief().process(story)


async def test_both_votes_doubting_rejects(monkeypatch):
    story = await _decide(_judged_story(confidence=0.2, support=0.1), monkeypatch)
    assert story.status == StoryStatus.REJECTED
    assert story.human_reviewer == "auto_audit"


async def test_watersheep_alone_doubting_goes_to_review(monkeypatch):
    story = await _decide(_judged_story(confidence=0.9, support=0.1), monkeypatch)
    assert story.status == StoryStatus.NEEDS_HUMAN_REVIEW
