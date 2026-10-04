"""Desk banter: short comedy bits between stories.

Bits are labeled on screen and kept free of facts: no real people,
companies, places in the news, numbers or politics. The jokes are about
life at the desk and the anchors' habits. Code drops any line with a number
or a political word; the director then asks WaterSheep to drop lines that
read as factual claims.
"""

from __future__ import annotations

import json
import random
import re
from typing import List

from ann_agents.broadcast.lineup import anchor
from ann_agents.broadcast.models import Lineup, ScriptLine, Show
from ann_agents.llm.router import LLMTier, llm_router

BIT_FACT_QUESTION = "Does this line state a fact about a real person, company, product, place or event?"

TOPICS = [
    "the studio coffee", "the teleprompter running too fast", "whose mug was left on the desk",
    "the weather wall's favorite city", "Marla's running bet with Oscar", "the overnight shift",
    "the ON AIR sign flickering", "being made of pixels", "the lighting rig", "the desk chairs",
    "reading the ticker out loud", "the city outside the window", "the studio plant",
    "practicing a sign-off", "the green room snacks", "matching outfits by accident",
]

MOODS = {"happy", "amused", "excited", "confused", "skeptical", "surprised", "neutral"}
_BLOCK = re.compile(
    r"\d|elect|president|senat|congress|democrat|republican|\bvot|\bparty\b|\bwar\b|israel|gaza|ukrain|russia|"
    r"china|trump|biden|harris|\bgod\b|church|muslim|jew|christian|immigra|abortion|\bgun",
    re.IGNORECASE,
)

SYSTEM = """You write a short comedy bit for the anchors of {network}, a 24-hour pixel-art news channel. It airs between stories, labeled DESK BANTER on screen.
Rules:
- No facts at all: no real people, companies, brands, products, places in the news, numbers, dates or events.
- No politics, religion, or jokes about any group of people. Nothing mean; the anchors tease each other warmly.
- Joke about life at the desk and the anchors' habits (their personas are below).
- 3 to 5 short spoken lines, each under 160 characters. No stage directions.
Reply with JSON only: {{"lines": [{{"speaker": "anchor id", "text": "...", "mood": "happy|amused|excited|confused|skeptical|surprised|neutral"}}]}}"""


async def write_bit(lineup: Lineup, show: Show, desk: List[str]) -> List[ScriptLine]:
    people = [anchor(lineup, i) for i in desk]
    cast = "\n".join(f"- {p.id}: {p.name}, {p.role}. {p.persona}" for p in people)
    topic = random.choice(TOPICS)
    reply = await llm_router.complete(
        tier=LLMTier.CHEAP,
        system_prompt=SYSTEM.format(network=lineup.network),
        user_prompt=f"Show: {show.name}.\nAt the desk:\n{cast}\n\nTopic: {topic}.",
        max_tokens=500,
        temperature=0.9,
        response_format={"type": "json_object"},
    )
    try:
        raw = json.loads(reply or "{}").get("lines", [])
    except json.JSONDecodeError:
        return []
    lines: List[ScriptLine] = []
    for item in raw[:5]:
        if not isinstance(item, dict):
            continue
        speaker, text = item.get("speaker"), str(item.get("text") or "").strip()
        if speaker not in desk or not text or len(text) > 200 or _BLOCK.search(text):
            continue
        mood = item.get("mood") if item.get("mood") in MOODS else "amused"
        lines.append(ScriptLine(speaker=speaker, text=text, mood=mood))
    return lines
