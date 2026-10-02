"""Standards: what may go on air.

Two passes. The rules pass is code and always runs: every figure an anchor
says must appear in a fact the line cites, quotes must be verbatim, and the
speaker must be at the desk. The desk pass asks a second model whether each
surviving line is supported by the fact sheet. A line that fails either pass
is cut; a segment that loses too much is thrown out and the story airs as a
plain headline read instead.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, Iterable, List, Optional, Sequence, Set

from ann_agents.broadcast.models import DraftLine, DroppedLine, Fact

MAX_LINE_CHARS = 280
MIN_KEPT_LINES = 2
MAX_DROPPED_SHARE = 1 / 3

_SCALES = {
    "hundred": 1e2,
    "k": 1e3, "thousand": 1e3,
    "m": 1e6, "mn": 1e6, "million": 1e6,
    "b": 1e9, "bn": 1e9, "billion": 1e9,
    "t": 1e12, "trillion": 1e12,
}

_FIGURE = re.compile(
    r"""
    (?<![\w.])
    (?:[$€£]\s?)?
    (?P<num>\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)
    (?:\s?(?P<scale>hundred|thousand|million|billion|trillion|bn|mn|[kmbt])(?![a-z]))?
    (?:\s?(?:%|percent\b|per\ cent\b))?
    """,
    re.IGNORECASE | re.VERBOSE,
)
_NUMBER_WORDS = (
    "a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|"
    "sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|"
    "hundred|thousand|million|billion|half|several|dozen"
)
# "five hundred million", "twelve percent", "a billion"; not "per million".
_SPELLED_FIGURE = re.compile(
    rf"\b(?:{_NUMBER_WORDS})[\s-]+(?:hundred|thousand|million|billion|trillion|percent|per cent)\b",
    re.IGNORECASE,
)
_QUOTE = re.compile(r"\"([^\"]{12,})\"")
_URL = re.compile(r"https?://|www\.", re.IGNORECASE)
_PUNCT = re.compile(r"[^a-z0-9%$.\s]")


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    text = text.replace("‘", "'").replace("’", "'").replace("“", '"').replace("”", '"')
    text = text.replace("–", "-").replace("—", "-")
    return text


def figures(text: str) -> List[float]:
    """Numeric values written in digits, with k/M/B/T and million/billion applied."""
    values = []
    for match in _FIGURE.finditer(normalize(text)):
        value = float(match.group("num").replace(",", ""))
        scale = match.group("scale")
        if scale:
            value *= _SCALES[scale.lower()]
        values.append(value)
    return values


def _same(a: float, b: float) -> bool:
    return abs(a - b) <= 1e-9 * max(abs(a), abs(b), 1.0)


def _squash(text: str) -> str:
    return " ".join(_PUNCT.sub(" ", normalize(text).lower()).split())


@dataclass
class RulesResult:
    kept: List[DraftLine] = field(default_factory=list)
    dropped: List[DroppedLine] = field(default_factory=list)


def check_line(
    line: DraftLine,
    facts_by_id: Dict[int, Fact],
    desk: Set[str],
    allowed_years: Iterable[int] = (),
) -> Optional[str]:
    """Return why a line can't air, or None if it passes the rules."""
    text = normalize(line.text).strip()
    if line.speaker not in desk:
        return f"speaker {line.speaker!r} is not at the desk"
    if len(text) < 2:
        return "empty line"
    if len(text) > MAX_LINE_CHARS:
        return f"line is {len(text)} characters; the limit is {MAX_LINE_CHARS}"
    if _URL.search(text):
        return "reads out a URL"

    unknown = [i for i in line.fact_ids if i not in facts_by_id]
    if unknown:
        return f"cites facts that don't exist: {unknown}"
    cited = [facts_by_id[i] for i in line.fact_ids]

    said = figures(text)
    if said:
        if not cited:
            return "states a figure without citing a fact"
        sourced = [v for fact in cited for v in figures(fact.text)]
        years = [float(y) for y in allowed_years]
        for value in said:
            if not any(_same(value, v) for v in sourced + years):
                return f"figure {value:g} is not in the cited facts"

    leftover = _FIGURE.sub(" ", text)
    if _SPELLED_FIGURE.search(leftover):
        return "spells out a figure; figures must be digits copied from the facts"

    for quote in _QUOTE.findall(text):
        if _squash(quote) not in _squash(" ".join(f.text for f in facts_by_id.values())):
            return "quotes words that are not in the facts"

    return None


_CITE_NOTE = re.compile(r"\s*[\[(](?:cite[sd]?\s*)?(?:facts?\s*)?\d+(?:\s*(?:,|and)\s*(?:facts?\s*)?\d+)*[\])]", re.IGNORECASE)


def tidy_line(line: DraftLine, anchors: Dict[str, str]) -> DraftLine:
    """Fix the slips small models make that change nothing about the claim.

    Speakers given by name ("Marla" or "Marla Quill") become their anchor id,
    and citation notes left in the spoken text ("[Cite Fact 1]", "(3)") are
    removed. Anything else is left for the rules to judge.
    """
    speaker = line.speaker.strip()
    lowered = speaker.lower()
    for anchor_id, name in anchors.items():
        if lowered in (anchor_id, name.lower(), name.split()[0].lower()):
            speaker = anchor_id
            break
    text = " ".join(_CITE_NOTE.sub("", line.text).split())
    return DraftLine(speaker=speaker, text=text, fact_ids=line.fact_ids)


def apply_rules(
    lines: Sequence[DraftLine],
    facts: Sequence[Fact],
    desk: Sequence[str],
    now: Optional[datetime] = None,
) -> RulesResult:
    now = now or datetime.now(timezone.utc)
    facts_by_id = {f.id: f for f in facts}
    result = RulesResult()
    for line in lines:
        reason = check_line(line, facts_by_id, set(desk), allowed_years=(now.year,))
        if reason:
            result.dropped.append(DroppedLine(speaker=line.speaker, text=line.text, reason=reason, stage="rules"))
        else:
            result.kept.append(line)
    return result


def segment_survives(drafted: int, kept: Sequence[DraftLine]) -> Optional[str]:
    """Return why what's left can't air as a segment, or None."""
    if len(kept) < MIN_KEPT_LINES:
        return f"only {len(kept)} line(s) passed standards"
    if drafted and (drafted - len(kept)) / drafted > MAX_DROPPED_SHARE:
        return f"{drafted - len(kept)} of {drafted} lines were cut"
    if not any(line.fact_ids for line in kept):
        return "no remaining line cites the story"
    return None
