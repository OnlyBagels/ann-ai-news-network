"""Shapes for the live broadcast.

Segment, SegmentArticle and ScriptLine serialize to the camelCase JSON in
ann-web/src/broadcast/types.ts, which the web player and the streamer read.
"""

from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

MOUTH_FPS = 15


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
    anchors: List[str]
    categories: List[str]
    color: str
    segments_per_story: int = 1


class GridSlot(_Camel):
    hour_utc: int
    show: str


class Lineup(BaseModel):
    network: str
    anchors: List[Anchor]
    shows: List[Show]
    grid: List[GridSlot]
    reporters: List[Reporter] = Field(default_factory=list)
    beats: Dict[str, str] = Field(default_factory=dict)  # category -> reporter id


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


class SegmentArticle(_Camel):
    id: str
    title: str
    source: str
    url: str


class ScriptLine(_Camel):
    speaker: str
    text: str
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
    kind: Literal["story", "reel", "ident"]
    starts_at: datetime
    duration_ms: int
    title: str
    anchors: List[str]
    articles: List[SegmentArticle]
    lines: List[ScriptLine]


# What the script writer is asked to return. Kept free of length or range
# constraints so the schema works with structured outputs; the standards
# check enforces limits afterwards.


class DraftLine(BaseModel):
    speaker: str = Field(description="Anchor id of the person speaking")
    text: str = Field(description="What they say, as spoken words")
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
