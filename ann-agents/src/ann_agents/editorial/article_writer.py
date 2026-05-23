"""ArticleWriter - writes the actual article body, not just a summary.

The reporter and editorial agents classify, fact-check, and summarize.
None of them write the article a reader actually opens. This one does.

Runs after the parallel editorial batch (HeadlineEditor, TechnicalEditor,
StyleEditor, SummaryEditor) so it has the TL;DR and any technical
review notes available as anchor points.
"""

from __future__ import annotations

from ann_agents.core.base_agent import BaseAgent
from ann_agents.core.personas import reporter_for_category, reporter_for_section
from ann_agents.core.types import AgentRole, Story
from ann_agents.core.voice import apply_voice
from ann_agents.llm.router import LLMTier, llm_router


def _paragraph_count(text: str) -> int:
    return len([p for p in text.split("\n\n") if p.strip()])


def _build_role_prompt(persona) -> str:
    """Compose the writer's system prompt around the assigned persona."""
    return f"""\
You are {persona.name}, {persona.role} for ANN. You are writing this
article under your byline.

YOUR VOICE
{persona.personality}

YOUR BACKGROUND
{persona.background or "No additional background provided."}

Write a 4-6 paragraph article in your voice based on the source
material the user supplies. This is real journalism, not a press
release rewrite.

STRUCTURE (inverted pyramid)
- Paragraph 1: lead with the news in your characteristic way. The
  single most load-bearing fact for your beat.
- Paragraphs 2-3: technical or business detail you would dig into,
  given your beat instincts. Include concrete specifics.
- Paragraph 4: context. What this changes for readers.
- Paragraph 5 (optional): what you would watch next.

ATTRIBUTION
- Cite the source by name when you quote a number, claim, or direct
  phrase.
- When the dossier contains multiple sources, name at least two distinct
  sources in the article body.
- Do not invent facts not present in the source or the research
  dossier.

FORMAT
- Plain prose. Separate paragraphs with a blank line (two newlines).
- No headings, no bullet lists, no bold/italic markdown.
- Target 300-500 words and at least 3 paragraphs.
- If the source is thin, still write at least 2 short paragraphs,
  grounded only in what is known.
- Return ONLY the article body. No title, no TL;DR, no preamble, no
  JSON wrapper. Do NOT sign your name at the end - the byline is
  rendered separately.
"""


class ArticleWriter(BaseAgent):
    """Writes the article body (story.content) from the source material."""

    def __init__(self):
        super().__init__(AgentRole.ARTICLE_WRITER)

    async def process(self, story: Story) -> Story:
        src = story.primary_source
        body = src.content if src else None
        source_summary = (src.summary if src else None) or story.summary or story.tl_dr

        dossier = ""
        reporter_briefs = []
        if src and src.metadata:
            dossier = (src.metadata.get("research_dossier") or "").strip()
            reporter_briefs = src.metadata.get("reporter_briefs") or []

        body_chars = len((body or "").strip())
        summary_chars = len((source_summary or "").strip())
        has_dossier = len(dossier) > 350
        has_minimum_evidence = body_chars >= 80 or summary_chars >= 120 or has_dossier
        if not has_minimum_evidence:
            return story

        source_text = self._truncate((body or source_summary or ""), max_chars=6000)

        dossier_block = ""
        if dossier:
            dossier_block = (
                "\n---\n"
                "RESEARCH DOSSIER (from 3 parallel researchers - web search,\n"
                "linked-page follow-ups, entity lookups). Use these as your\n"
                "primary source of specific numbers, names, and quotes.\n\n"
                f"{dossier[:6000]}\n"
            )

        reporter_briefs_block = ""
        if reporter_briefs:
            lines = []
            for brief in reporter_briefs[:16]:
                if not isinstance(brief, dict):
                    continue
                reporter = str(brief.get("reporter") or "desk")
                summary = str(brief.get("summary") or "").strip()
                if summary:
                    lines.append(f"- {reporter}: {summary}")
            if lines:
                reporter_briefs_block = (
                    "\n---\n"
                    "REPORTER DESK BRIEFS (parallel newsroom pass).\n"
                    "Use these angles as secondary context, but do not invent facts.\n\n"
                    + "\n".join(lines)
                    + "\n"
                )

        persona = reporter_for_section(story.section) or reporter_for_category(story.category)
        role_prompt = _build_role_prompt(persona)

        user_prompt = (
            f"SOURCE TITLE: {story.title}\n"
            f"SOURCE: {src.source_name if src else 'unknown'}\n"
            f"URL: {src.url if src else 'unknown'}\n"
            f"TL;DR: {story.tl_dr or '(none - derive your own lead from the source)'}\n"
            f"TAGS: {', '.join(story.tags) if story.tags else '(none)'}\n"
            f"\nSOURCE CONTENT:\n{source_text}"
            f"{dossier_block}"
            f"{reporter_briefs_block}"
        )

        result = await llm_router.complete(
            tier=LLMTier.PREMIUM,
            system_prompt=apply_voice(role_prompt),
            user_prompt=user_prompt,
            temperature=0.5,
            max_tokens=1500,
        )

        if not result:
            return story

        draft = result.strip()
        if _paragraph_count(draft) < 3:
            rewrite = await llm_router.complete(
                tier=LLMTier.PREMIUM,
                system_prompt=apply_voice(role_prompt),
                user_prompt=(
                    user_prompt
                    + "\n\nREWRITE REQUIREMENT: Return at least 3 paragraphs separated by blank lines. "
                    "Keep every claim tied to the supplied source content and dossier."
                ),
                temperature=0.4,
                max_tokens=1500,
            )
            if rewrite:
                rewrite_text = rewrite.strip()
                if _paragraph_count(rewrite_text) >= 3:
                    draft = rewrite_text

        story.content = draft
        return story
