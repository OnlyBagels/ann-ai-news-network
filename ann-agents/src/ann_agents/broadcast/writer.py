"""Claude writes the segment, and a second Claude call reviews it.

The writer gets a numbered fact sheet and returns structured lines, each
citing the facts it uses. The standards desk reads the same fact sheet and
marks each line supported or not.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, List, Optional, Sequence

from loguru import logger

from ann_agents.broadcast.budget import Spend, cost_of
from ann_agents.broadcast.facts import render_fact_sheet
from ann_agents.broadcast.models import (
    DeskReview,
    DraftLine,
    DraftScript,
    Fact,
    Lineup,
    Show,
    StoryInput,
)

# Models that take the server-side refusal fallback. On a decline the API
# reruns the request on a model chosen by refusal category.
_FALLBACK_MODELS = {"claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-1"}
_EFFORT_MODELS = _FALLBACK_MODELS | {"claude-sonnet-5", "claude-opus-4-8", "claude-opus-4-7"}


def _request_options(model: str, effort: str) -> dict:
    options: dict = {}
    if model in _FALLBACK_MODELS:
        options["betas"] = ["server-side-fallback-2026-07-01"]
        options["fallbacks"] = "default"
    if model in _EFFORT_MODELS:
        options["output_config"] = {"effort": effort}
    return options


def writer_system_prompt(lineup: Lineup) -> str:
    cast = "\n".join(f"- {a.id}: {a.name}, {a.role}. {a.persona}" for a in lineup.anchors)
    return f"""You write on-air dialogue for {lineup.network}, the AI News Network, a 24-hour pixel-art cable news channel about artificial intelligence. Viewers are builders, researchers and founders who want to know what happened and why it matters to their work.

The anchors:
{cast}

How a segment works:
- You get one story as a numbered fact sheet, the show it airs on, and who is at the desk.
- Write 4 to 7 lines of spoken dialogue between the anchors at the desk. One anchor reads the story; the other reacts, asks the obvious follow-up, or says what it means for people building with AI. Keep their personalities, but the story leads.
- Name the source out loud once, by the name on the fact sheet.
- Each line is one or two spoken sentences, under 240 characters. Plain words a person would say on air. No stage directions, no emoji, no markdown, no URLs.

Accuracy rules. These are checked by code and by an editor, and a line that breaks one is cut before air:
- State as fact only what the fact sheet says. Opinions and questions are fine when they are clearly opinions or questions.
- Every number, price, percentage, version or date you say must be written in digits exactly as it appears in a fact you cite. Do not round, convert or combine numbers. Do not spell figures out in words.
- Cite in fact_ids every fact a line relies on. Lines with no factual claim (a reaction, a question) cite nothing.
- Never invent quotes, people, benchmarks, release dates, prices or reactions from companies or the public.
- If the facts are thin, say less. A short, accurate segment beats a padded one.

The title is the lower-third headline: plain, specific, at most 60 characters, no clickbait."""


def writer_user_prompt(
    story: StoryInput,
    facts: Sequence[Fact],
    show: Show,
    desk: Sequence[str],
    lineup: Lineup,
    previous_line: Optional[str],
    now: datetime,
) -> str:
    names = {a.id: a.name for a in lineup.anchors}
    at_desk = ", ".join(f"{anchor_id} ({names[anchor_id]})" for anchor_id in desk)
    parts = [
        f"Show: {show.name}. {show.blurb}",
        f"At the desk, left to right: {at_desk}. Use these ids as speaker.",
        f"Time on air: {now:%H:%M} UTC.",
    ]
    if previous_line:
        parts.append(f"The last thing said on air, for continuity only: {previous_line}")
    parts.append(f"Category: {story.category}")
    parts.append("Fact sheet:\n" + render_fact_sheet(facts))
    return "\n\n".join(parts)


DESK_SYSTEM = """You are the standards editor for a television news channel about AI. You check a script against the fact sheet it was written from, before air.

For each numbered line decide supported true or false.
- false if the line states as fact anything the fact sheet does not say, including names, numbers, dates, comparisons, causes, reactions, or claims about what something will do.
- false if it misstates or exaggerates a fact, or presents a guess as fact.
- true for opinions and questions that are clearly framed as such, reactions, and handoffs, as long as they don't slip in a new factual claim.
Give a short reason for every false. Return one verdict per line, using the line's index."""


@dataclass
class WriterResult:
    script: Optional[DraftScript]
    spend: Spend
    model: str


@dataclass
class DeskResult:
    unsupported: dict  # line index -> reason
    spend: Spend
    ok: bool  # False when the review itself failed; treat every line as unchecked


class ClaudeNewsroom:
    """The two Claude calls a story segment needs."""

    def __init__(self, client: Any, writer_model: str, feature_model: str, standards_model: str):
        self.client = client
        self.writer_model = writer_model
        self.feature_model = feature_model
        self.standards_model = standards_model

    async def write(
        self,
        story: StoryInput,
        facts: Sequence[Fact],
        show: Show,
        desk: Sequence[str],
        lineup: Lineup,
        previous_line: Optional[str],
        now: datetime,
        feature: bool = False,
    ) -> WriterResult:
        model = self.feature_model if feature else self.writer_model
        try:
            response = await self.client.beta.messages.parse(
                model=model,
                max_tokens=4000,
                system=writer_system_prompt(lineup),
                messages=[{
                    "role": "user",
                    "content": writer_user_prompt(story, facts, show, desk, lineup, previous_line, now),
                }],
                output_format=DraftScript,
                cache_control={"type": "ephemeral"},
                **_request_options(model, "medium"),
            )
        except Exception as e:  # network, rate limit, schema: the story falls back to a headline read
            logger.error(f"[broadcast] script writer failed on {model}: {e}")
            return WriterResult(script=None, spend=Spend(), model=model)

        spend = cost_of(getattr(response, "model", None) or model, response.usage)
        if response.stop_reason in ("refusal", "max_tokens") or response.parsed_output is None:
            logger.warning(f"[broadcast] no usable script from {model} (stop_reason={response.stop_reason})")
            return WriterResult(script=None, spend=spend, model=model)
        return WriterResult(script=response.parsed_output, spend=spend, model=model)

    async def review(self, facts: Sequence[Fact], lines: List[DraftLine]) -> DeskResult:
        model = self.standards_model
        numbered = "\n".join(f"{i}. {line.speaker}: {line.text}" for i, line in enumerate(lines))
        try:
            response = await self.client.beta.messages.parse(
                model=model,
                max_tokens=4000,
                system=DESK_SYSTEM,
                messages=[{
                    "role": "user",
                    "content": f"Fact sheet:\n{render_fact_sheet(facts)}\n\nScript:\n{numbered}",
                }],
                output_format=DeskReview,
                **_request_options(model, "medium"),
            )
        except Exception as e:
            logger.error(f"[broadcast] standards desk failed on {model}: {e}")
            return DeskResult(unsupported={}, spend=Spend(), ok=False)

        spend = cost_of(getattr(response, "model", None) or model, response.usage)
        review = response.parsed_output
        if response.stop_reason in ("refusal", "max_tokens") or review is None:
            return DeskResult(unsupported={}, spend=spend, ok=False)

        verdicts = {v.index: v for v in review.verdicts}
        unsupported = {}
        for i in range(len(lines)):
            verdict = verdicts.get(i)
            if verdict is None:
                unsupported[i] = "the editor returned no verdict for this line"
            elif not verdict.supported:
                unsupported[i] = verdict.reason or "not supported by the facts"
        return DeskResult(unsupported=unsupported, spend=spend, ok=True)
