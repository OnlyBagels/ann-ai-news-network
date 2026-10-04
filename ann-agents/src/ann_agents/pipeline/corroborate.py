"""Other outlets' reports of the same event.

Each story is written from its own source plus up to three others that
cover the same thing, so the article can cite more than one outlet and the
fact-check can compare them. Candidates are found by shared headline words,
spread across outlets and political leans where possible, and confirmed by
WaterSheep when it's available.
"""

from __future__ import annotations

import asyncio
import re
from typing import Dict, List, Sequence, Set

from ann_agents.core.types import SourceItem
from ann_agents.llm.watersheep import Ask, watersheep

SAME_EVENT = "Do these two headlines report the same news event?"
MIN_SHARED = 3
MIN_OVERLAP = 0.25
MIN_SAME = 0.6

_WORD = re.compile(r"[A-Za-z0-9][A-Za-z0-9'\-]*")
_STOP = set(
    """the a an and or but for nor of to in on at by with from as into over after before about against between
    during without within under above says said say will would could should may might can new more most
    this that these those its it's their his her they them what when where which who why how than then
    have has had been being were was are is be not no yes just also amid after year years week day today""".split()
)


def keywords(title: str) -> Set[str]:
    return {w.lower().strip("'") for w in _WORD.findall(title) if len(w) > 2 and w.lower() not in _STOP}


def coverage(items: Sequence[SourceItem]) -> Dict[str, int]:
    """For each item URL, how many other outlets ran a headline on the same thing."""
    keys = [keywords(i.title) for i in items]
    counts: Dict[str, int] = {}
    for a, ka in enumerate(keys):
        outlets = set()
        for b, kb in enumerate(keys):
            if a == b or items[a].source_name == items[b].source_name:
                continue
            shared = ka & kb
            if len(shared) >= MIN_SHARED and len(shared) / max(1, len(ka | kb)) >= MIN_OVERLAP:
                outlets.add(items[b].source_name)
        counts[items[a].url] = len(outlets)
    return counts


async def related(item: SourceItem, pool: Sequence[SourceItem], limit: int = 3) -> List[SourceItem]:
    """Up to `limit` reports of the same event from other outlets, varied in lean."""
    mine = keywords(item.title)
    scored = []
    for other in pool:
        if other.url == item.url or other.source_name == item.source_name:
            continue
        theirs = keywords(other.title)
        shared = mine & theirs
        if len(shared) < MIN_SHARED:
            continue
        overlap = len(shared) / max(1, len(mine | theirs))
        if overlap >= MIN_OVERLAP:
            scored.append((overlap, other))
    scored.sort(key=lambda t: -t[0])
    candidates = [o for _, o in scored[: limit * 4]]

    ws = watersheep()
    if ws is not None and candidates:
        asks = [Ask(f"Headline A: {item.title}\nHeadline B: {c.title}", SAME_EVENT) for c in candidates]
        answers = await asyncio.to_thread(ws.ask_many, asks)
        candidates = [c for c, a in zip(candidates, answers) if a.p_yes >= MIN_SAME]

    # One per outlet, and a spread of leans before a second of the same lean.
    picked: List[SourceItem] = []
    outlets = {item.source_name}
    leans = {item.metadata.get("lean")}
    for pass_ in (0, 1):
        for c in candidates:
            if len(picked) >= limit:
                break
            if c.source_name in outlets:
                continue
            lean = c.metadata.get("lean")
            if pass_ == 0 and lean in leans:
                continue
            picked.append(c)
            outlets.add(c.source_name)
            leans.add(lean)
    return picked
