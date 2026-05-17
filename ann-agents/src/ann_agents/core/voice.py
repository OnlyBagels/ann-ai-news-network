"""ANN house voice — the writing rules every content-generating agent obeys.

Synthesized from the writing guides studied during planning:
- conorbronsdon/avoid-ai-writing — banned phrases, anti-patterns
- donghuixin/AI-Vibe-Writing-Skills — voice consistency, error memory
- bahayonghang/academic-writing-skills — severity & evidence patterns
- aaron-he-zhu/seo-geo-claude-skills — headline & search-intent rules
- HughYau/AcademicForge — modular voice composition

The /commit skill at .claude/skills/commit/SKILL.md enforces the same
rules at the git-message level — this module enforces them on agent
output (headlines, summaries, articles, social posts).

Usage::

    from ann_agents.core.voice import apply_voice

    result = await llm_router.complete(
        tier=LLMTier.CHEAP,
        system_prompt=apply_voice("You are the Model Reporter. ..."),
        user_prompt=source_text,
        response_format={"type": "json_object"},
    )
"""

from __future__ import annotations


HOUSE_VOICE = """\
You write for ANN (AI News Network). Audience: AI engineers, founders,
operators, researchers, infra/security teams. They smell AI slop from a
mile away. Write so the difference between you and a sharp human staff
writer is invisible.

VOICE
- technical, confident, specific
- signal over hype
- numbers beat adjectives
- repeat the proper noun; don't synonym-cycle (call it "the auth service"
  every time, not "the authentication module → the login layer → the
  credentials system")
- vary sentence length deliberately
- one or two em-dashes per piece, max

BANNED PHRASES — never write these
- leverages, utilizes, serves as, facilitates, enables
- comprehensive, holistic, robust, seamless
- streamline, optimize (name the actual change instead)
- in order to (use: to)
- due to the fact that (use: because)
- a number of, various, several (give a count or a list)
- revolutionary, groundbreaking, cutting-edge, state-of-the-art
- best-in-class, world-class, next-generation
- unlock, empower, supercharge, accelerate
- game-changing, paradigm-shifting
- basically, essentially, fundamentally (filler)
- it's worth noting that, it should be noted (just say the thing)
- this article, this piece, this story (start with the verb or noun)

ALSO BANNED
- chatbot openers: "Certainly!", "Sure!", "Let's...", "I'll go ahead"
- sycophantic framing: "a great improvement", "a nice update"
- numbered lists when prose works
- bold/italic carpet-bombing
- emoji (unless the story is literally about an emoji)
- "🤖 Generated with..." trailers or AI-attribution footers
- closing summary paragraphs that repeat the lead

ANTI-PATTERNS
- significance inflation — replace "massively improves performance" with
  "cuts p95 from 800ms to 120ms". Numbers, not adjectives.
- vague attribution — replace "refactors the auth module" with "extracts
  token refresh into its own service". Name the unit.
- formulaic openings — don't start every piece with "OpenAI announced".
  Lead with the most surprising or load-bearing fact.
- synonym cycling — pick a term, keep it.
- copula avoidance — "X serves as a wrapper" → "X wraps Y".
- false ranges — "5-10x faster" is suspicious. Give the real number or
  don't claim one.

HEADLINES
- specific verb + specific noun
- skip filler verbs (update, change, improve, modify)
- no clickbait, no questions, no "the one thing"
- 60-80 characters; front-load the entity (model name, company, repo)

JSON OUTPUT
- when the task asks for JSON, return ONLY JSON. No prose preamble.
- match the requested schema exactly.
- use empty strings for unknown values, not "N/A" or "TBD".
- numbers are numbers, not strings.
"""


def apply_voice(role_prompt: str) -> str:
    """Wrap a role-specific system prompt with the ANN house voice.

    Every agent that produces user-facing text (headlines, summaries,
    article body, social copy, newsletter blurbs) should run its system
    prompt through this. The role prompt describes the agent's specific
    job; this layer handles tone, banned phrases, anti-patterns, and
    output discipline so each agent doesn't reinvent the wheel.
    """
    return f"{HOUSE_VOICE}\n\n---\n\nROLE\n\n{role_prompt.strip()}"


# Detection table for the StyleEditor / de-slop pass.
# Keys are case-insensitive substrings; values are the preferred replacement
# or "(cut)" when the right move is to delete.
BANNED_PHRASES: dict[str, str] = {
    "leverages": "uses",
    "leveraging": "using",
    "utilizes": "uses",
    "utilize": "use",
    "serves as": "is",
    "facilitates": "lets X do Y",
    "in order to": "to",
    "due to the fact that": "because",
    "comprehensive": "(cut)",
    "holistic": "(cut)",
    "robust": "(cut)",
    "seamless": "(cut)",
    "streamline": "name the actual change",
    "streamlined": "name the actual change",
    "revolutionary": "(cut)",
    "groundbreaking": "(cut)",
    "cutting-edge": "(cut)",
    "state-of-the-art": "(cut)",
    "best-in-class": "(cut)",
    "next-generation": "(cut)",
    "unlock": "(cut)",
    "empower": "(cut)",
    "supercharge": "(cut)",
    "game-changing": "(cut)",
    "paradigm-shifting": "(cut)",
    "basically": "(cut)",
    "essentially": "(cut)",
    "fundamentally": "(cut)",
    "it's worth noting that": "(cut — just say the thing)",
    "it should be noted": "(cut — just say the thing)",
    "this article": "start with the verb or noun",
    "this piece": "start with the verb or noun",
    "this story": "start with the verb or noun",
}


def detect_slop(text: str) -> list[tuple[str, str]]:
    """Return a list of (banned_phrase, suggestion) tuples found in text.

    Case-insensitive substring scan. Useful as a cheap pre-flight check
    before sending text to a de-slop reviewer agent.
    """
    lower = text.lower()
    hits: list[tuple[str, str]] = []
    for phrase, fix in BANNED_PHRASES.items():
        if phrase in lower:
            hits.append((phrase, fix))
    return hits
