"""On-air lines for data hits, written from the board by template.

No model writes these: every number said on air is read off the board, in
the same words every time, so there is nothing to fact-check."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List
from zoneinfo import ZoneInfo

from ann_agents.broadcast.models import ScriptLine


def _as_of(board: Dict[str, Any]) -> str:
    when = datetime.fromisoformat(board["asOf"]).astimezone(ZoneInfo("America/New_York"))
    # %-I (no leading zero) is glibc-only; build the hour by hand so it runs on Windows too
    return f"{when.hour % 12 or 12}:{when:%M} {when:%p}".lower() + " Eastern"


def _chunks(items: List[Any], n: int) -> List[List[Any]]:
    return [items[i : i + n] for i in range(0, len(items), n)]


def weather_lines(board: Dict[str, Any], presenter: str) -> List[ScriptLine]:
    places = board["places"]
    lines = [ScriptLine(speaker=presenter, text="Here's the weather across the country right now.", mood="happy")]
    for group in _chunks(places[:9], 3):
        said = ". ".join(f"{p['name']}, {p['tempF']} degrees and {p['words']}" for p in group)
        lines.append(ScriptLine(speaker=presenter, text=f"{said}.", mood="neutral"))
    hot = max(places, key=lambda p: p["hiF"])
    cold = min(places, key=lambda p: p["loF"])
    lines.append(ScriptLine(
        speaker=presenter,
        text=f"The high today in {hot['name']} is {hot['hiF']}, and the low in {cold['name']} is {cold['loF']}.",
        mood="neutral",
    ))
    lines.append(ScriptLine(speaker=presenter, text=f"Temperatures from {board['source']} as of {_as_of(board)}.", mood="happy"))
    return lines


def sports_lines(board: Dict[str, Any], anchors: List[str]) -> List[ScriptLine]:
    a, b = anchors[0], anchors[-1]
    finals = [g for g in board["games"] if g.get("state") == "post" and g["awayScore"] is not None]
    live = [g for g in board["games"] if g.get("state") == "in" and g["awayScore"] is not None]
    lines = [ScriptLine(speaker=a, text="Time for the scores.", mood="excited")]
    for i, g in enumerate(finals[:4]):
        lines.append(ScriptLine(
            speaker=a if i % 2 == 0 else b,
            text=f"Final in the {g['league']}: {g['awayName']} {g['awayScore']}, {g['homeName']} {g['homeScore']}.",
            mood="neutral",
        ))
    for g in live[:2]:
        lines.append(ScriptLine(
            speaker=b,
            text=f"Still going in the {g['league']}: {g['awayName']} {g['awayScore']}, {g['homeName']} {g['homeScore']}, {g['status']}.",
            mood="excited",
        ))
    if len(lines) == 1:
        upcoming = [g for g in board["games"] if g.get("state") == "pre"][:3]
        if not upcoming:
            return []
        said = "; ".join(f"{g['awayName']} at {g['homeName']}, {g['status']}" for g in upcoming)
        lines.append(ScriptLine(speaker=b, text=f"No final scores yet. Coming up: {said}.", mood="neutral"))
    lines.append(ScriptLine(speaker=a, text=f"Scores from {board['source']} as of {_as_of(board)}.", mood="neutral"))
    return lines


def _price(p: float) -> str:
    if p >= 100:
        return f"{p:,.0f}"
    if p >= 1:
        return f"{p:,.2f}"
    return f"{p:.4f}".rstrip("0")


def markets_lines(board: Dict[str, Any], presenter: str) -> List[ScriptLine]:
    lines = [ScriptLine(speaker=presenter, text="A look at crypto prices.", mood="neutral")]
    for q in board["quotes"][:5]:
        move = "up" if q["changePct"] >= 0 else "down"
        lines.append(ScriptLine(
            speaker=presenter,
            text=f"{q['name']} is at {_price(q['price'])} dollars, {move} {abs(q['changePct']):.2f} percent over 24 hours.",
            mood="neutral",
        ))
    lines.append(ScriptLine(
        speaker=presenter,
        text=f"Prices from {board['source']} as of {_as_of(board)}. Nothing on ANN is financial advice.",
        mood="serious",
    ))
    return lines
