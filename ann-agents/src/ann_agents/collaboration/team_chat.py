"""Shared team-chat context helpers for collaborative agent rounds."""

from __future__ import annotations

from typing import Optional

from ann_agents.core.types import Story


def _meta(story: Story) -> Optional[dict]:
    if story.primary_source is None:
        return None
    return story.primary_source.metadata


def get_team_context(story: Story, team: str) -> str:
    """Read current context string for a team."""
    meta = _meta(story)
    if meta is None:
        return ""
    contexts = meta.get("team_chat_contexts")
    if not isinstance(contexts, dict):
        return ""
    value = contexts.get(team, "")
    return str(value) if value else ""


def set_team_context(story: Story, team: str, context: str, max_chars: int = 9000) -> None:
    """Set context for a team, keeping only the most recent max_chars."""
    meta = _meta(story)
    if meta is None:
        return
    contexts = meta.get("team_chat_contexts")
    if not isinstance(contexts, dict):
        contexts = {}
    clipped = (context or "").strip()
    if len(clipped) > max_chars:
        clipped = clipped[-max_chars:]
    contexts[team] = clipped
    meta["team_chat_contexts"] = contexts


def append_team_round(
    story: Story,
    team: str,
    round_idx: int,
    notes: list[str],
    max_chars: int = 9000,
) -> str:
    """Append one collaboration round to the team's rolling context."""
    existing = get_team_context(story, team)
    lines = [line.strip() for line in notes if line and line.strip()]
    if not lines:
        return existing

    header = f"ROUND {round_idx}"
    chunk = header + "\n" + "\n".join(f"- {line}" for line in lines)
    next_context = f"{existing}\n\n{chunk}".strip() if existing else chunk
    set_team_context(story, team, next_context, max_chars=max_chars)
    return get_team_context(story, team)


def format_team_context_block(story: Story, team: str) -> str:
    """Format context for inclusion in an LLM prompt."""
    context = get_team_context(story, team)
    if not context:
        return ""
    return (
        f"\nTEAM CHAT CONTEXT ({team.upper()}):\n"
        "Peers from earlier rounds left these notes. Treat them as hints,\n"
        "not ground truth; verify against source evidence.\n"
        f"{context}\n"
    )
