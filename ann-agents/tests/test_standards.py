from datetime import datetime, timezone

from ann_agents.broadcast.models import DraftLine, Fact
from ann_agents.broadcast.standards import apply_rules, check_line, figures, segment_survives

FACTS = [
    Fact(id=1, text="Headline: Lab ships a model with a 1M token context window"),
    Fact(id=2, text="Source: Example Lab Blog"),
    Fact(id=3, text="Pricing is $0.28 per million input tokens."),
    Fact(id=4, text="It scored 71.2% on the long-context benchmark, up from 64%."),
    Fact(id=5, text="The company said: \"we built this for agents that read whole codebases\"."),
]
BY_ID = {f.id: f for f in FACTS}
DESK = {"marla", "oscar"}


def line(text, *ids, speaker="marla"):
    return DraftLine(speaker=speaker, text=text, fact_ids=list(ids))


def test_figures_parse_scales_and_currency():
    assert figures("a 1M window") == [1e6]
    assert figures("$0.28 per million") == [0.28]
    assert figures("70B parameters and 128K context") == [70e9, 128e3]
    assert figures("1,500 GPUs") == [1500.0]
    assert figures("71.2% on the test") == [71.2]
    assert figures("GPT-5 and 3 months") == [5.0, 3.0]


def test_figure_from_cited_fact_passes():
    assert check_line(line("It costs $0.28 per million input tokens.", 3), BY_ID, DESK) is None
    assert check_line(line("71.2 percent, up from 64 percent.", 4), BY_ID, DESK) is None


def test_figure_not_in_cited_facts_is_cut():
    reason = check_line(line("It costs $0.30 per million input tokens.", 3), BY_ID, DESK)
    assert reason and "0.3" in reason


def test_rounded_figure_is_cut():
    assert check_line(line("Roughly 71% on the benchmark.", 4), BY_ID, DESK)


def test_figure_from_an_uncited_fact_is_cut():
    # 0.28 is on the sheet, but the line only cites the headline.
    assert check_line(line("And it's $0.28 per million.", 1), BY_ID, DESK)


def test_figure_without_citation_is_cut():
    assert "without citing" in check_line(line("That's a 1M window."), BY_ID, DESK)


def test_spelled_out_figures_are_cut():
    assert check_line(line("It raised five hundred million dollars.", 1), BY_ID, DESK)
    assert check_line(line("Up twelve percent.", 4), BY_ID, DESK)


def test_small_spoken_numbers_in_banter_pass():
    assert check_line(line("Two things jump out at me.", speaker="oscar"), BY_ID, DESK) is None


def test_invented_citation_is_cut():
    assert "don't exist" in check_line(line("Big news.", 9), BY_ID, DESK)


def test_quotes_must_be_verbatim():
    ok = line('They said "we built this for agents that read whole codebases".', 5)
    bad = line('They said "this changes everything for every developer alive".', 5)
    assert check_line(ok, BY_ID, DESK) is None
    assert "quotes" in check_line(bad, BY_ID, DESK)


def test_speaker_must_be_at_the_desk():
    assert "not at the desk" in check_line(line("Hi.", speaker="juno"), BY_ID, DESK)


def test_urls_and_long_lines_are_cut():
    assert check_line(line("Read it at https://example.com", 2), BY_ID, DESK)
    assert check_line(line("word " * 80, 1), BY_ID, DESK)


def test_current_year_is_allowed_without_citation_match():
    now = datetime(2026, 10, 2, tzinfo=timezone.utc)
    result = apply_rules([line("The biggest launch of 2026 so far?", 1)], FACTS, list(DESK), now)
    assert len(result.kept) == 1


def test_segment_survival():
    good = [line("A.", 1), line("B.", speaker="oscar"), line("C.", 3)]
    assert segment_survives(3, good) is None
    assert "only 1" in segment_survives(3, good[:1])
    assert "were cut" in segment_survives(6, good)
    assert "cites the story" in segment_survives(2, [line("Hm."), line("Yes.", speaker="oscar")])


def test_tidy_line_maps_names_and_strips_citation_notes():
    from ann_agents.broadcast.standards import tidy_line

    anchors = {"marla": "Marla Quill", "oscar": "Oscar Byrne"}
    tidy = tidy_line(DraftLine(speaker="Marla", text="Big news [Cite Fact 1, Fact 2]. More (3).", fact_ids=[1]), anchors)
    assert tidy.speaker == "marla" and tidy.text == "Big news. More."
    assert tidy_line(DraftLine(speaker="Oscar Byrne", text="Hi.", fact_ids=[]), anchors).speaker == "oscar"
    # A figure in parentheses that isn't a citation stays.
    kept = tidy_line(DraftLine(speaker="juno", text="Version (4.5) ships.", fact_ids=[]), anchors)
    assert kept.speaker == "juno" and kept.text == "Version (4.5) ships."
