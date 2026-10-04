"""WaterSheep's vote on a written story.

Calibrated yes/no questions, answered by WaterSheep on CPU: is this a news
report (not an ad, a promotion or an opinion column), is the article
supported by its sources, is the headline clickbait, and is the language
loaded or one-sided. The editor-in-chief weighs them with the language
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

RELEVANCE = "Is this a news report about real events, rather than an advertisement, a promotion, a job listing or an opinion column?"
SUPPORT = "Is the article fully supported by the source text?"
CLICKBAIT = "Is this headline clickbait?"
LOADED = "Does this text use loaded, one-sided or partisan language?"
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
        items = story.source_items or ([source] if source else [])
        source_text = _plain("\n\n".join(article_source_text(i) for i in items), 3000) or story.title
        headline = story.headline or story.title
        article = _plain(" ".join(p for p in (story.summary, story.content) if p), 1200)

        # The news check is only asked of general feeds; trusted feeds pass.
        questions = {"clickbait": Ask(headline, CLICKBAIT)}
        if not (source and (source.metadata.get("ai_only") or source.source_name in ai_sources())):
            questions["relevance"] = Ask(f"{story.title}\n{_plain(story.summary or source_text, 600)}", RELEVANCE)
        if article:
            questions["support"] = Ask(f"Source text:\n{source_text}\n\nArticle:\n{article}", SUPPORT)
            questions["loaded"] = Ask(article, LOADED)
        answers = await asyncio.to_thread(ws.ask_many, list(questions.values()))
        judge = {name: round(a.p_yes, 3) for name, a in zip(questions, answers)}
        story.judge = judge
        self.last_output = {"model": ws.name, **judge}
        return story
