"""Shapes for the live broadcast.

Segment, SegmentArticle and ScriptLine serialize to the camelCase JSON in
ann-web/src/broadcast/types.ts, which the web player and the streamer read.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

MOUTH_FPS = 15

# How a line is delivered. Matches MOODS in ann-web/src/broadcast/types.ts,
# where the renderer turns it into a face and the others' reactions.
Mood = Literal[
    "neutral", "happy", "excited", "amused", "concerned", "empathetic",
    "sad", "angry", "serious", "surprised", "skeptical", "confused",
]


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class AnchorLook(BaseModel):
    skin: str
    hair: str
    hairStyle: str
    outfit: str
    accent: str
    glasses: bool


class Anchor(BaseModel):
    id: str
    name: str
    role: str
    voice: str
    look: AnchorLook
    persona: str


class Reporter(BaseModel):
    """A beat journalist: writes that beat's stories and reports on air."""

    id: str
    name: str
    beat: str
    title: str
    voice: str
    look: AnchorLook
    bio: str
    style: str


class Show(_Camel):
    id: str
    name: str
    blurb: str
    anchors: List[str]  # anchor ids, or reporter ids for a guest or correspondent
    categories: List[str]
    color: str
    segments_per_story: int = 1
    set: str = "desk"  # the studio set its stories air from
    # Data hits the show carries, from the data desks.
    weather: bool = False
    sports: bool = False
    markets: bool = False


class GridSlot(_Camel):
    hour_et: int  # hour of the day in the lineup's time zone (US Eastern)
    show: str


class Lineup(BaseModel):
    network: str
    anchors: List[Anchor]
    shows: List[Show]
    grid: List[GridSlot]
    reporters: List[Reporter] = Field(default_factory=list)
    beats: Dict[str, str] = Field(default_factory=dict)  # category -> reporter id
    timezone: str = "America/New_York"


class Fact(BaseModel):
    id: int
    text: str


class StoryInput(BaseModel):
    """An approved article, as the broadcast sees it."""

    id: str
    title: str
    source: str
    url: str
    category: str
    summary: str = ""
    tl_dr: Optional[str] = None
    published_at: datetime
    overall_score: int = 0
    byline: Optional[str] = None  # the reporter who wrote it, who may join the desk


class SegmentArticle(_Camel):
    id: str
    title: str
    source: str
    url: str


class ScriptLine(_Camel):
    speaker: str
    text: str
    mood: Mood = "neutral"
    start_ms: int = 0
    duration_ms: int = 0
    audio: Optional[str] = None
    mouth: Optional[List[float]] = None
    fact_ids: List[int] = Field(default_factory=list)


class DroppedLine(BaseModel):
    speaker: str
    text: str
    reason: str
    stage: Literal["rules", "watersheep", "desk"]


class Segment(_Camel):
    id: str
    show_id: str
    kind: Literal["story", "reel", "ident", "weather", "sports", "markets", "bit", "question"]
    starts_at: datetime
    duration_ms: int
    title: str
    anchors: List[str]
    articles: List[SegmentArticle]
    lines: List[ScriptLine]
    # The studio set, when not the show's home set, and a data board for its wall.
    set: Optional[str] = None
    board: Optional[Dict[str, Any]] = None


# What the script writer is asked to return. Kept free of length or range
# constraints so the schema works with structured outputs; the standards
# check enforces limits afterwards.


class DraftLine(BaseModel):
    speaker: str = Field(description="Anchor id of the person speaking")
    text: str = Field(description="What they say, as spoken words")
    mood: Mood = Field(
        default="neutral",
        description="How the anchor delivers the line; drives their face on screen",
    )
    fact_ids: List[int] = Field(
        description="Ids of the facts this line relies on. Empty only for lines with no factual claim."
    )


class DraftScript(BaseModel):
    title: str = Field(description="Lower-third headline, plain and specific, at most 60 characters")
    lines: List[DraftLine]


class LineVerdict(BaseModel):
    index: int
    supported: bool
    reason: str


class DeskReview(BaseModel):
    verdicts: List[LineVerdict]
