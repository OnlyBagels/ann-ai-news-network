"""The cast, the shows, and the 24-hour grid.

The lineup lives in ann-web/src/broadcast/lineup.json so the web player,
the streamer and this engine all read the same file.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from functools import lru_cache
from zoneinfo import ZoneInfo
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
    cast_ids = {a.id for a in lineup.anchors} | {r.id for r in lineup.reporters}
    show_ids = {s.id for s in lineup.shows}
    for show in lineup.shows:
        missing = set(show.anchors) - cast_ids
        if missing:
            raise ValueError(f"show {show.id} names unknown anchors: {sorted(missing)}")
    hours = [slot.hour_et for slot in lineup.grid]
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
    """An anchor, or a reporter at the desk as a guest or correspondent."""
    found = next((a for a in lineup.anchors if a.id == anchor_id), None)
    if found:
        return found
    r = next(r for r in lineup.reporters if r.id == anchor_id)
    return Anchor(id=r.id, name=r.name, role=r.title, voice=r.voice, look=r.look, persona=f"{r.bio} {r.style}")


def reporter_for(lineup: Lineup, beat: Optional[str]) -> Optional[Reporter]:
    reporter_id = lineup.beats.get(beat or "")
    return next((r for r in lineup.reporters if r.id == reporter_id), None)


def show(lineup: Lineup, show_id: str) -> Show:
    return next(s for s in lineup.shows if s.id == show_id)


def _local(lineup: Lineup, when: datetime) -> datetime:
    return when.astimezone(ZoneInfo(lineup.timezone))


def show_at(lineup: Lineup, when: datetime) -> Show:
    """The show on the grid at a moment (the grid is in the lineup's time zone)."""
    hour = _local(lineup, when).hour
    current = lineup.grid[0]
    for slot in lineup.grid:
        if slot.hour_et <= hour:
            current = slot
    return show(lineup, current.show)


def slot_start(lineup: Lineup, when: datetime) -> datetime:
    """When the grid slot containing `when` began, in UTC."""
    local = _local(lineup, when)
    start_hour = max(s.hour_et for s in lineup.grid if s.hour_et <= local.hour)
    return local.replace(hour=start_hour, minute=0, second=0, microsecond=0).astimezone(timezone.utc)


def next_slot_start(lineup: Lineup, when: datetime) -> datetime:
    local = _local(lineup, when)
    later = [s.hour_et for s in lineup.grid if s.hour_et > local.hour]
    day = local.replace(minute=0, second=0, microsecond=0)
    if later:
        return day.replace(hour=later[0]).astimezone(timezone.utc)
    tomorrow = (day + timedelta(days=1)).replace(hour=lineup.grid[0].hour_et)
    # Re-attach the zone so a DST change overnight is respected.
    return tomorrow.replace(tzinfo=None).replace(tzinfo=ZoneInfo(lineup.timezone)).astimezone(timezone.utc)
