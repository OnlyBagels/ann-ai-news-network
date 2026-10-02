"""Segments that need no model: headline reads and show opens.

A headline read airs the article's own words. It is what the channel falls
back to when the budget is spent, no model is configured, or a written
script fails standards.
"""

from __future__ import annotations

from typing import List, Sequence

from ann_agents.broadcast.facts import clean, sentences
from ann_agents.broadcast.models import Anchor, Fact, ScriptLine, Show, StoryInput
from ann_agents.broadcast.standards import MAX_LINE_CHARS


def headline_read(story: StoryInput, facts: Sequence[Fact], anchor_id: str) -> List[ScriptLine]:
    by_text = {f.text: f.id for f in facts}
    headline_id = next(f.id for f in facts if f.text.startswith("Headline: "))
    source_id = next(f.id for f in facts if f.text.startswith("Source: "))
    title = clean(story.title)
    if title[-1:] not in ".!?":
        title += "."
    lines = [ScriptLine(speaker=anchor_id, text=f"From {story.source}: {title}", fact_ids=[source_id, headline_id])]
    body = sentences(story.tl_dr or "") or sentences(story.summary)
    for sentence in body[:2]:
        if len(sentence) <= MAX_LINE_CHARS and sentence in by_text:
            lines.append(ScriptLine(speaker=anchor_id, text=sentence, fact_ids=[by_text[sentence]]))
    return lines


def show_open(show: Show, anchors: Sequence[Anchor], network: str) -> List[ScriptLine]:
    host, *others = anchors
    lines = [ScriptLine(speaker=host.id, text=f"This is {show.name} on {network}. I'm {host.name}.")]
    for other in others:
        lines.append(ScriptLine(speaker=other.id, text=f"And I'm {other.name}."))
    lines.append(ScriptLine(speaker=host.id, text=show.blurb))
    return lines
