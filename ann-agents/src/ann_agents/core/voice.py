"""ANN house voice: the words and habits that make copy read as machine-written.

Reporters get STYLE_RULES as part of ARTICLE_RULES. After the editors run, the
pipeline scans the headline, summary and body with detect_slop() and records
each hit on the story, so an editor in the review queue sees them. A hit never
holds or rejects a story by itself.

The /commit skill at .claude/skills/commit/SKILL.md bans the same phrases in
commit messages. Change both together.
"""

from __future__ import annotations

import re

# phrase -> what to write instead ("(cut)" when the right move is to delete it)
BANNED_PHRASES: dict[str, str] = {
    "leverages": "uses",
    "leveraging": "using",
    "utilizes": "uses",
    "utilize": "use",
    "serves as": "is",
    "facilitates": "name what it lets someone do",
    "in order to": "to",
    "due to the fact that": "because",
    "comprehensive": "(cut)",
    "holistic": "(cut)",
    "robust": "(cut)",
    "seamless": "(cut)",
    "streamline": "name the actual change",
    "revolutionary": "(cut)",
    "groundbreaking": "(cut)",
    "cutting-edge": "(cut)",
    "state-of-the-art": "(cut)",
    "best-in-class": "(cut)",
    "world-class": "(cut)",
    "next-generation": "(cut)",
    "game-changing": "(cut)",
    "game-changer": "(cut)",
    "paradigm shift": "(cut)",
    "supercharge": "(cut)",
    "basically": "(cut)",
    "essentially": "(cut)",
    "it's worth noting": "(cut, just say the thing)",
    "it is worth noting": "(cut, just say the thing)",
    "it should be noted": "(cut, just say the thing)",
    "in today's fast-paced": "(cut)",
    "delve": "look at, examine",
    "tapestry": "(cut)",
    "testament to": "(cut)",
    "sends shockwaves": "(cut)",
    "this article": "start with the verb or noun",
}

STYLE_RULES = (
    "- Write like a wire reporter: plain words, specific nouns, numbers instead of adjectives.\n"
    "- Call a person, company or product by the same name every time; don't cycle synonyms.\n"
    "- Never use these words or phrases: "
    + ", ".join(f'"{p}"' for p in BANNED_PHRASES)
    + ".\n"
    "- No closing paragraph that repeats the lead, no emoji, no chatbot openers."
)

_PATTERNS = {
    phrase: re.compile(r"(?<![\w-])" + re.escape(phrase) + r"(?![\w-])", re.IGNORECASE)
    for phrase in BANNED_PHRASES
}


def detect_slop(text: str) -> list[tuple[str, str]]:
    """Each banned phrase in text, as (phrase, suggestion), in table order.

    Whole words only, so "robustness" or "delved" don't count as their stems.
    """
    if not text:
        return []
    return [(phrase, BANNED_PHRASES[phrase]) for phrase, pattern in _PATTERNS.items() if pattern.search(text)]
