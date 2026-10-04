from datetime import datetime

from ann_agents.core.types import SourceItem
from ann_agents.pipeline import assignment, corroborate


def item(title, outlet, lean=None, section=None):
    return SourceItem(title=title, url=f"https://x/{outlet}/{title}", source_name=outlet, source_type="rss",
                      published_at=datetime(2026, 10, 2), metadata={"lean": lean, "category_hint": section})


POOL = [
    item("Senate passes border funding bill after late vote", "Outlet A", "center-left"),
    item("Senate passes border funding bill in late-night vote", "Outlet B", "center-right"),
    item("Late vote: Senate passes border funding bill", "Outlet C", "center-left"),
    item("Border funding bill passes Senate after late vote", "Outlet D", "center"),
    item("Local bakery wins pie contest", "Outlet E"),
]


async def test_related_spreads_outlets_and_leans(monkeypatch):
    monkeypatch.setattr(corroborate, "watersheep", lambda: None)
    picked = await corroborate.related(POOL[0], POOL)
    # Other leans come before a second center-left outlet.
    assert {p.source_name for p in picked[:2]} == {"Outlet B", "Outlet D"}
    assert "Outlet E" not in [p.source_name for p in picked]
    assert len(picked) == 3


def test_coverage_counts_other_outlets():
    counts = corroborate.coverage(POOL)
    assert counts[POOL[0].url] == 3
    assert counts[POOL[4].url] == 0


def test_section_mix_caps_any_one_section():
    picks = [item(f"Sports {i}", f"S{i}", section="sports") for i in range(5)] + [item("World 1", "W", section="world")]
    kept = assignment.with_section_mix(picks, 6)
    assert sum(1 for k in kept if k.metadata["category_hint"] == "sports") == 2
    assert kept[-1].title == "World 1"
