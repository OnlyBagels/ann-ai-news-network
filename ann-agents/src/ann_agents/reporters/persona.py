"""The byline reporter's voice, added to the reporter agent's prompt."""

from __future__ import annotations

from typing import Optional

from loguru import logger

from ann_agents.core.types import Story


def persona_note(story: Story) -> str:
    """A short brief on who is writing, or "" when the story has no byline."""
    reporter = _reporter(story.byline)
    if reporter is None:
        return ""
    return (
        f"\n\nYou are writing as {reporter.name}, ANN's {reporter.title.lower()}. "
        f"House style for this beat: {reporter.style} "
        "Every fact must come from the source text above; the style never adds facts."
    )


def _reporter(reporter_id: Optional[str]):
    if not reporter_id:
        return None
    try:
        from ann_agents.broadcast.lineup import load_lineup

        lineup = load_lineup()
    except Exception as e:  # the lineup file is optional for the newsroom
        logger.warning(f"[persona] lineup unavailable: {e}")
        return None
    return next((r for r in lineup.reporters if r.id == reporter_id), None)
