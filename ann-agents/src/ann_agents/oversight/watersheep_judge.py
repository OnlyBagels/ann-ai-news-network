"""WaterSheep's vote on a written story.

Three calibrated yes/no questions, answered by WaterSheep on CPU:
is the story about AI, does the summary follow from the source, and is the
headline clickbait. The editor-in-chief weighs them with the language
model's fact-check; a story publishes only when both pass it.
"""

from __future__ import annotations

import asyncio
import re

from ann_agents.core.base_agent import BaseAgent
from ann_agents.core.types import AgentRole, Story
from ann_agents.ingestion.article_text import source_text as article_source_text
from ann_agents.llm.watersheep import Ask, watersheep
from ann_agents.ingestion.sources import ai_sources

RELEVANCE = "Is this about artificial intelligence or machine learning?"
SUPPORT = "Is the summary fully supported by the source text?"
CLICKBAIT = "Is this headline clickbait?"
_TAGS = re.compile(r"<[^>]+>")


def _plain(text: str, limit: int = 2500) -> str:
    return " ".join(_TAGS.sub(" ", text or "").split())[:limit]


class WaterSheepJudge(BaseAgent):
    def __init__(self):
        super().__init__(AgentRole.WATERSHEEP_JUDGE)

    async def process(self, story: Story) -> Story:
        ws = watersheep()
        if ws is None:
            return story
        source = story.primary_source
        source_text = _plain(article_source_text(source)) or story.title
        headline = story.headline or story.title

        # Relevance is only asked of general feeds; AI-only feeds are AI news.
        questions = {"clickbait": Ask(headline, CLICKBAIT)}
        if not (source and (source.metadata.get("ai_only") or source.source_name in ai_sources())):
            questions["relevance"] = Ask(f"{story.title}\n{_plain(story.summary or source_text, 600)}", RELEVANCE)
        if story.summary:
            questions["support"] = Ask(
                f"Source text:\n{source_text}\n\nSummary:\n{_plain(story.summary, 1200)}", SUPPORT
            )
        answers = await asyncio.to_thread(ws.ask_many, list(questions.values()))
        judge = {name: round(a.p_yes, 3) for name, a in zip(questions, answers)}
        story.judge = judge
        self.last_output = {"model": ws.name, **judge}
        return story
