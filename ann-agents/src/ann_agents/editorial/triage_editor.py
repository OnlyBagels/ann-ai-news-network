"""TriageEditor — the assigning editor.

The old pipeline ran all six beat reporters on every story in parallel.
Wasteful and not how a real newsroom works: an editor reads the
incoming wire, decides if it's worth covering, picks the right beat,
and hands it to one reporter. That reporter then owns the story.

TriageEditor does exactly that. One cheap LLM call up front. Outputs
the assigned reporter role; the pipeline then runs only that reporter
instead of fanning out to six.
"""

from __future__ import annotations

import json
from typing import Optional

from loguru import logger

from ann_agents.core.base_agent import BaseAgent
from ann_agents.core.types import AgentRole, Category, Story, parse_category
from ann_agents.core.voice import apply_voice
from ann_agents.llm.router import LLMTier, llm_router


_BEAT_TO_REPORTER = {
    Category.MODELS: AgentRole.MODEL_REPORTER,
    Category.OPEN_SOURCE: AgentRole.OPEN_SOURCE_REPORTER,
    Category.CODING_AI: AgentRole.MODEL_REPORTER,        # closest match
    Category.AGENTS: AgentRole.OPEN_SOURCE_REPORTER,     # closest match
    Category.RESEARCH: AgentRole.RESEARCH_REPORTER,
    Category.SECURITY: AgentRole.SECURITY_REPORTER,
    Category.REGULATION: AgentRole.REGULATION_REPORTER,
    Category.FUNDING: AgentRole.BUSINESS_REPORTER,
}


_TRIAGE_PROMPT = """\
You are the Triage Editor at ANN. Incoming wire stories cross your
desk. For each one you decide:

1. Which beat owns it (one of: models, open_source, coding_ai,
   agents, research, security, funding, regulation).
2. How load-bearing the story is (interest_score 0-100). High score =
   readers actively need to know this today. Low score = filler,
   incremental, or already widely covered.

You see the title, source, and an excerpt of the body. Return a JSON
object exactly:
{
  "category": "models" | "open_source" | "coding_ai" | "agents" |
              "research" | "security" | "funding" | "regulation",
  "interest_score": 0-100,
  "rationale": "one short sentence explaining why this beat fits"
}

Be decisive. Pick the single best beat — do not return arrays.
"""


class TriageEditor(BaseAgent):
    """Reads an incoming story, picks the beat that owns it."""

    def __init__(self):
        super().__init__(AgentRole.TRIAGE_EDITOR)

    async def process(self, story: Story) -> Story:
        src = story.primary_source
        excerpt = ""
        if src and src.content:
            excerpt = src.content[:1500]
        elif src and src.summary:
            excerpt = src.summary[:1500]

        user_prompt = (
            f"TITLE: {story.title}\n"
            f"SOURCE: {src.source_name if src else 'unknown'}\n"
            f"URL: {src.url if src else 'unknown'}\n"
            f"EXCERPT:\n{excerpt or '(no body — title only)'}"
        )

        result = await llm_router.complete(
            tier=LLMTier.CHEAP,
            system_prompt=apply_voice(_TRIAGE_PROMPT),
            user_prompt=user_prompt,
            response_format={"type": "json_object"},
            max_tokens=300,
        )

        if not result:
            # graceful default: route to the model reporter (the most
            # general beat) so the pipeline still produces a draft.
            story.category = story.category or Category.MODELS
            return story

        try:
            data = json.loads(result)
            cat = parse_category(data.get("category")) or Category.MODELS
            story.category = cat
            rationale = data.get("rationale") or ""
            interest = data.get("interest_score")
            logger.info(
                f"[triage] {story.title[:50]} → {cat.value} "
                f"(interest={interest}) — {rationale[:80]}"
            )
        except json.JSONDecodeError as e:
            logger.warning(f"[triage] bad json from llm: {e}; falling back to MODELS")
            story.category = story.category or Category.MODELS

        return story


def assigned_reporter(story: Story) -> Optional[AgentRole]:
    """Map the triaged category to a reporter role.

    Returns None if no reporter handles the category (defensive — the
    enum mapping covers all known categories today).
    """
    if not story.category:
        return AgentRole.MODEL_REPORTER
    cat = story.category if isinstance(story.category, Category) else Category(story.category)
    return _BEAT_TO_REPORTER.get(cat, AgentRole.MODEL_REPORTER)
