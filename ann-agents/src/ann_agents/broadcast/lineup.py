"""The cast, the shows, and the 24-hour grid.

The lineup lives in ann-web/src/broadcast/lineup.json so the web player,
the streamer and this engine all read the same file.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Optional

from ann_agents.broadcast.models import Anchor, Lineup, Reporter, Show
from ann_agents.core.config import settings

REPO_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_LINEUP = REPO_ROOT / "ann-web" / "src" / "broadcast" / "lineup.json"


@lru_cache(maxsize=4)
def load_lineup(path: Optional[str] = None) -> Lineup:
    source = Path(path or settings.broadcast_lineup_path or DEFAULT_LINEUP)
    lineup = Lineup.model_validate_json(source.read_text())
    _validate(lineup)
    return lineup


def _validate(lineup: Lineup) -> None:
    anchor_ids = {a.id for a in lineup.anchors}
    show_ids = {s.id for s in lineup.shows}
    for show in lineup.shows:
        missing = set(show.anchors) - anchor_ids
        if missing:
            raise ValueError(f"show {show.id} names unknown anchors: {sorted(missing)}")
    hours = [slot.hour_utc for slot in lineup.grid]
    if hours != sorted(hours) or not hours or hours[0] != 0 or hours[-1] > 23:
        raise ValueError("grid must start at hour 0 and run in order within the day")
    for slot in lineup.grid:
        if slot.show not in show_ids:
            raise ValueError(f"grid names unknown show: {slot.show}")
    reporter_ids = {r.id for r in lineup.reporters}
    for beat, reporter_id in lineup.beats.items():
        if reporter_id not in reporter_ids:
            raise ValueError(f"beat {beat} names unknown reporter: {reporter_id}")


def anchor(lineup: Lineup, anchor_id: str) -> Anchor:
    return next(a for a in lineup.anchors if a.id == anchor_id)


def reporter_for(lineup: Lineup, beat: Optional[str]) -> Optional[Reporter]:
    reporter_id = lineup.beats.get(beat or "")
    return next((r for r in lineup.reporters if r.id == reporter_id), None)


def show(lineup: Lineup, show_id: str) -> Show:
    return next(s for s in lineup.shows if s.id == show_id)


def show_at(lineup: Lineup, when: datetime) -> Show:
    """The show on the grid at a UTC moment."""
    hour = when.astimezone(timezone.utc).hour
    current = lineup.grid[0]
    for slot in lineup.grid:
        if slot.hour_utc <= hour:
            current = slot
    return show(lineup, current.show)


def slot_start(lineup: Lineup, when: datetime) -> datetime:
    """When the grid slot containing `when` began."""
    when = when.astimezone(timezone.utc)
    start_hour = max(s.hour_utc for s in lineup.grid if s.hour_utc <= when.hour)
    return when.replace(hour=start_hour, minute=0, second=0, microsecond=0)


def next_slot_start(lineup: Lineup, when: datetime) -> datetime:
    when = when.astimezone(timezone.utc)
    later = [s.hour_utc for s in lineup.grid if s.hour_utc > when.hour]
    day = when.replace(minute=0, second=0, microsecond=0)
    if later:
        return day.replace(hour=later[0])
    return (day + timedelta(days=1)).replace(hour=lineup.grid[0].hour_utc)
