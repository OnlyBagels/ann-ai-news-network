"""What every ANN reporter is told about writing, and the sources they get.

Each reporter has its own beat and house style; these rules are the same for
all of them and are what the fact-check holds them to.
"""

from __future__ import annotations

from ann_agents.core.types import Story
from ann_agents.ingestion.article_text import source_text

ARTICLE_RULES = """

Write a complete news article from the sources you are given, for a general audience.
- headline: plain and specific, under 90 characters. No clickbait, no questions.
- summary: two sentences: what happened and why it matters, naming the outlet that reported it.
- body: 4 to 8 short paragraphs separated by blank lines. Lead with the most important fact.
- Attribute every factual claim in the sentence that makes it ("according to the BBC", "the company said in a statement", "court filings show"). When several sources report the same fact, name the first one listed.
- Quote people only word for word from a source, in quotation marks, and say who said it and where.
- When sources disagree, say so and give each version with its source. When someone is accused of something and a source includes their response, include it.
- Neutral language: no loaded or partisan labels, no adjectives about anyone's motives, no speculation, predictions or opinions of your own. Use people's official titles and the names groups use for themselves.
- Use only what the sources say. Never add numbers, dates, names, quotes or background that are not in them, even if you believe them to be true.
- If the sources are thin, write less. Two accurate paragraphs beat six padded ones.

Return JSON: {"headline": str, "summary": str, "body": str, "tags": [str], "key_points": [str]}"""


def sources_block(story: Story, primary_chars: int = 8000, other_chars: int = 4000) -> str:
    """Every source for the story, numbered, with its outlet, link, date and text."""
    parts = [f"Story: {story.title}"]
    items = story.source_items or ([story.primary_source] if story.primary_source else [])
    for i, src in enumerate(items):
        limit = primary_chars if i == 0 else other_chars
        text = source_text(src)
        when = src.published_at.strftime("%Y-%m-%d %H:%M UTC") if src.published_at else "unknown"
        parts.append(f"\n--- Source {i + 1}: {src.source_name} ---")
        parts.append(f"Headline: {src.title}")
        parts.append(f"URL: {src.url}")
        parts.append(f"Published: {when}")
        if src.author:
            parts.append(f"Author: {src.author}")
        parts.append(f"Text: {text[:limit] if text else '(no text beyond the headline)'}")
    return "\n".join(parts)
