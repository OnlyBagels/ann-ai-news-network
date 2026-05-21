"""ArticleWriter — writes the actual article body, not just a summary.

The reporter and editorial agents classify, fact-check, and summarize.
None of them write the article a reader actually opens. This one does:
4–6 paragraphs of real journalism in ANN's voice, grounded in the
trafilatura-extracted source body.

Runs after the parallel editorial batch (HeadlineEditor, TechnicalEditor,
StyleEditor, SummaryEditor) so it has the TL;DR and any technical
review notes available as anchor points.
"""

from __future__ import annotations

from ann_agents.core.base_agent import BaseAgent
from ann_agents.core.personas import reporter_for_category
from ann_agents.core.types import AgentRole, Story
from ann_agents.core.voice import apply_voice
from ann_agents.llm.router import LLMTier, llm_router


def _build_role_prompt(persona) -> str:
    """Compose the writer's system prompt around the assigned persona.

    The persona block sits ABOVE the structural rules so the LLM treats
    voice as the primary frame and structure as constraints to satisfy
    within that voice — not the other way around.
    """
    return f"""\
You are {persona.name}, {persona.role} for ANN. You are writing this
article under your byline.

YOUR VOICE
{persona.personality}

Write a 4–6 paragraph article in your voice based on the source
material the user supplies. This is real journalism, not a press
release rewrite.

STRUCTURE (inverted pyramid)
- Paragraph 1: lead with the news in your characteristic way. The
  single most load-bearing fact for your beat — for Maya that's a
  benchmark, for Sasha that's CVE + impact, for Priya that's the
  round size. No "in a move that…" preamble.
- Paragraphs 2–3: technical or business detail you'd dig into,
  given your beat instincts. Specific numbers, exact mechanisms,
  what makes this different.
- Paragraph 4: context. What this changes for the readers you write
  for. Concrete second-order effects.
- Paragraph 5 (optional, only if there's something real to say):
  what you'd watch next.

ATTRIBUTION
- Cite the source by name when you quote a number, claim, or direct
  phrase. Sound like a working reporter quoting their reporting.
- Do not invent facts not present in the source or the research
  dossier. If the source is thin, write a shorter piece.

FORMAT
- Plain prose. Separate paragraphs with a blank line (two newlines).
- No headings, no bullet lists, no bold/italic markdown.
- 300–500 words total. Shorter is fine.
- Return ONLY the article body. No title, no TL;DR, no preamble, no
  JSON wrapper. Do NOT sign your name at the end — the byline is
  rendered separately.
"""


class ArticleWriter(BaseAgent):
    """Writes the article body (story.content) from the source material."""

    def __init__(self):
        super().__init__(AgentRole.ARTICLE_WRITER)

    async def process(self, story: Story) -> Story:
        # Nothing to ground on → skip rather than hallucinate.
        body = story.primary_source.content if story.primary_source else None
        if not body or len(body.strip()) < 200:
            return story

        source_text = self._truncate(body, max_chars=6000)
        src = story.primary_source

        # The JournalistResearcher stashes its 3-researcher dossier here.
        dossier = ""
        if src and src.metadata:
            dossier = (src.metadata.get("research_dossier") or "").strip()

        dossier_block = ""
        if dossier:
            dossier_block = (
                "\n---\n"
                "RESEARCH DOSSIER (from 3 parallel researchers — web search,\n"
                "linked-page follow-ups, entity lookups). Use these as your\n"
                "primary source of specific numbers, names, and quotes.\n\n"
                f"{dossier[:6000]}\n"
            )

        # Pick the persona writing this story. The TriageEditor already
        # set story.category, so we resolve to the matching reporter.
        persona = reporter_for_category(story.category)
        role_prompt = _build_role_prompt(persona)

        user_prompt = (
            f"SOURCE TITLE: {story.title}\n"
            f"SOURCE: {src.source_name if src else 'unknown'}\n"
            f"URL: {src.url if src else 'unknown'}\n"
            f"TL;DR: {story.tl_dr or '(none — derive your own lead from the source)'}\n"
            f"TAGS: {', '.join(story.tags) if story.tags else '(none)'}\n"
            f"\nSOURCE CONTENT:\n{source_text}"
            f"{dossier_block}"
        )

        result = await llm_router.complete(
            tier=LLMTier.PREMIUM,
            system_prompt=apply_voice(role_prompt),
            user_prompt=user_prompt,
            temperature=0.5,  # slightly hotter so voices diverge more
            max_tokens=1500,
        )

        if result:
            story.content = result.strip()

        return story
