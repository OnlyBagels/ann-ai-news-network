from datetime import datetime, timezone

from ann_agents.broadcast.facts import build_fact_sheet
from ann_agents.broadcast.lineup import load_lineup, next_slot_start, show_at, slot_start
from ann_agents.broadcast.models import ScriptLine, StoryInput
from ann_agents.broadcast.reel import headline_read, show_open
from ann_agents.broadcast.standards import apply_rules
from ann_agents.broadcast.timing import GAP_MS, TAIL_MS, envelope, estimate_ms, lay_out
from ann_agents.broadcast.models import DraftLine

STORY = StoryInput(
    id="a1",
    title="Lab ships a model with a 1M token context window",
    source="Example Lab Blog",
    url="https://www.example.org/blog/model",
    category="models",
    summary="<p>The model reads 1M tokens.</p> Pricing is $0.28 per million input tokens. It ships today.",
    tl_dr="A 1M context model at $0.28 per million input tokens.",
    published_at=datetime(2026, 10, 1, 15, 0, tzinfo=timezone.utc),
    overall_score=70,
)


def test_fact_sheet_is_verbatim_and_numbered():
    facts = build_fact_sheet(STORY)
    texts = [f.text for f in facts]
    assert texts[0] == "Headline: Lab ships a model with a 1M token context window"
    assert "Source: Example Lab Blog" in texts
    assert "Source website: example.org" in texts
    assert "Published: October 1, 2026" in texts
    assert "Pricing is $0.28 per million input tokens." in texts
    assert [f.id for f in facts] == list(range(1, len(facts) + 1))
    assert not any("<p>" in t for t in texts)


def test_headline_read_passes_its_own_standards():
    facts = build_fact_sheet(STORY)
    lines = headline_read(STORY, facts, "marla")
    assert lines[0].text == "From Example Lab Blog: Lab ships a model with a 1M token context window."
    drafted = [DraftLine(speaker=l.speaker, text=l.text, fact_ids=l.fact_ids) for l in lines]
    result = apply_rules(drafted, facts, ["marla"])
    assert result.dropped == []


def test_lineup_grid_covers_the_day():
    lineup = load_lineup()
    for hour in range(24):
        when = datetime(2026, 10, 2, hour, 30, tzinfo=timezone.utc)
        assert show_at(lineup, when).id
        assert slot_start(lineup, when) <= when < next_slot_start(lineup, when)
    late = datetime(2026, 10, 2, 23, 0, tzinfo=timezone.utc)
    assert next_slot_start(lineup, late) == datetime(2026, 10, 3, 0, 0, tzinfo=timezone.utc)


def test_show_open_introduces_the_desk():
    lineup = load_lineup()
    show = lineup.shows[0]
    anchors = [a for a in lineup.anchors if a.id in show.anchors]
    lines = show_open(show, anchors, "ANN")
    assert lines[0].text.startswith(f"This is {show.name} on ANN.")
    assert {l.speaker for l in lines} == set(show.anchors)


def test_lay_out_places_lines_end_to_end():
    lines = [ScriptLine(speaker="a", text="One two three."), ScriptLine(speaker="b", text="Four.")]
    total = lay_out(lines, [2000, None])
    assert lines[0].start_ms == 0 and lines[0].duration_ms == 2000
    assert lines[1].start_ms == 2000 + GAP_MS
    assert lines[1].duration_ms == estimate_ms("Four.")
    assert total == lines[1].start_ms + lines[1].duration_ms + TAIL_MS


def test_envelope_scales_to_one():
    silence_then_loud = [0.0] * 1000 + [0.5, -0.5] * 1000
    env = envelope(silence_then_loud, sample_rate=3000, fps=15)
    assert env[0] == 0.0
    assert max(env) == 1.0
    assert all(0.0 <= v <= 1.0 for v in env)


def test_segment_json_matches_the_web_contract():
    from ann_agents.broadcast.models import Segment, SegmentArticle

    seg = Segment(
        id="s1", show_id="the-wire", kind="reel", starts_at=datetime(2026, 10, 2, tzinfo=timezone.utc),
        duration_ms=1000, title="T", anchors=["marla"],
        articles=[SegmentArticle(id="a", title="t", source="s", url="u")],
        lines=[ScriptLine(speaker="marla", text="Hi.", start_ms=0, duration_ms=900, fact_ids=[1])],
    )
    data = seg.model_dump(by_alias=True)
    assert {"showId", "startsAt", "durationMs"} <= data.keys()
    assert {"startMs", "durationMs", "factIds", "audio", "mouth"} <= data["lines"][0].keys()
