"""Facts about the feeds the newsroom reads."""

from __future__ import annotations

from typing import Set

from ann_agents.core.config import settings


def ai_sources() -> Set[str]:
    """Feeds that only publish AI news (NEWSROOM_AI_SOURCES)."""
    return {s.strip() for s in settings.newsroom_ai_sources.split(",") if s.strip()}
