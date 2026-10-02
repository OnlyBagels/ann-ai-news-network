"""Fact sheets: the only material an anchor may state as fact.

Every segment is written from a numbered list of facts taken verbatim from
an approved article. The standards check later holds each line to it.
"""

from __future__ import annotations

import re
from typing import List
from urllib.parse import urlparse

from ann_agents.broadcast.models import Fact, StoryInput

_SENTENCE_END = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"'(])")
_TAGS = re.compile(r"<[^>]+>")
_SPACE = re.compile(r"\s+")


def clean(text: str) -> str:
    return _SPACE.sub(" ", _TAGS.sub(" ", text or "")).strip()


def sentences(text: str) -> List[str]:
    return [s.strip() for s in _SENTENCE_END.split(clean(text)) if len(s.strip()) > 3]


def build_fact_sheet(story: StoryInput, max_summary_sentences: int = 8) -> List[Fact]:
    facts: List[str] = [f"Headline: {clean(story.title)}"]
    facts.append(f"Source: {story.source}")
    host = urlparse(story.url).netloc
    if host:
        facts.append(f"Source website: {host.removeprefix('www.')}")
    published = story.published_at
    facts.append(f"Published: {published:%B} {published.day}, {published.year}")
    if story.tl_dr:
        facts.extend(sentences(story.tl_dr))
    seen = {f.lower() for f in facts}
    for sentence in sentences(story.summary)[:max_summary_sentences]:
        if sentence.lower() not in seen:
            facts.append(sentence)
            seen.add(sentence.lower())
    return [Fact(id=i + 1, text=text) for i, text in enumerate(facts)]


def render_fact_sheet(facts: List[Fact]) -> str:
    return "\n".join(f"[{f.id}] {f.text}" for f in facts)
