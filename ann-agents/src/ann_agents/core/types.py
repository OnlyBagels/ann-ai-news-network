"""Core type definitions for the ANN agentic newsroom."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class AgentRole(str, Enum):
    """All agent roles in the ANN newsroom."""

    # Reporter Agents
    MODEL_REPORTER = "model_reporter"
    OPEN_SOURCE_REPORTER = "open_source_reporter"
    RESEARCH_REPORTER = "research_reporter"
    SECURITY_REPORTER = "security_reporter"
    REGULATION_REPORTER = "regulation_reporter"
    BUSINESS_REPORTER = "business_reporter"

    # Research Agents
    RESEARCH_AGENT = "research_agent"

    # Fact-Check Agents
    FACT_CHECK_AGENT = "fact_check_agent"

    # Editorial Agents
    HEADLINE_EDITOR = "headline_editor"
    TECHNICAL_EDITOR = "technical_editor"
    STYLE_EDITOR = "style_editor"
    SUMMARY_EDITOR = "summary_editor"

    # Oversight Agents
    RISK_AGENT = "risk_agent"
    LEGAL_AGENT = "legal_agent"
    BIAS_AGENT = "bias_agent"
    EDITOR_IN_CHIEF = "editor_in_chief"


class AgentState(str, Enum):
    """State of an agent's work on a story."""

    PENDING = "pending"
    WORKING = "working"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


class StoryStatus(str, Enum):
    """Status of a story in the pipeline."""

    RAW = "raw"  # Just ingested
    CLUSTERED = "clustered"  # Deduplicated and grouped
    INVESTIGATING = "investigating"  # Reporter agents working
    ENRICHED = "enriched"  # Research agents done
    VERIFIED = "verified"  # Fact-check done
    EDITED = "edited"  # Editorial done
    REVIEWED = "reviewed"  # Oversight done
    APPROVED = "approved"  # Ready to publish
    PUBLISHED = "published"
    REJECTED = "rejected"
    NEEDS_HUMAN_REVIEW = "needs_human_review"


class RiskLevel(str, Enum):
    """Risk classification for stories."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class Category(str, Enum):
    """Article categories matching the frontend schema."""

    MODELS = "models"
    OPEN_SOURCE = "open_source"
    CODING_AI = "coding_ai"
    AGENTS = "agents"
    RESEARCH = "research"
    SECURITY = "security"
    FUNDING = "funding"
    REGULATION = "regulation"


def parse_category(value: Any) -> Optional[Category]:
    """Best-effort parse of an LLM-supplied category string.

    LLMs return free text like "Model Release", "model-release", "advisory".
    Normalize case + separators, then try the enum. Returns None when no
    valid match — callers should fall back to a default or skip the
    assignment rather than letting Category(invalid) raise.
    """
    if value is None:
        return None
    normalized = str(value).strip().lower().replace("-", "_").replace(" ", "_")
    try:
        return Category(normalized)
    except ValueError:
        return None


class SourceItem(BaseModel):
    """A raw source item ingested from any source."""

    id: str = Field(default_factory=lambda: f"src_{datetime.utcnow().timestamp()}")
    title: str
    url: str
    source_name: str  # e.g., "OpenAI Blog", "GitHub Trending", "arXiv"
    source_type: str  # "rss", "api", "scraper"
    author: Optional[str] = None
    published_at: datetime
    content: Optional[str] = None
    summary: Optional[str] = None
    raw_html: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class AgentAction(BaseModel):
    """Record of an agent's action on a story."""

    agent_role: AgentRole
    state: AgentState = AgentState.PENDING
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    output: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    duration_ms: Optional[int] = None


class ConfidenceScore(BaseModel):
    """Fact-check confidence scoring."""

    overall_confidence: float = 0.0  # 0-1
    source_quality: float = 0.0  # 0-1
    controversy_score: float = 0.0  # 0-1 (higher = more controversial)
    citation_count: int = 0
    verified_claims: int = 0
    unverified_claims: int = 0
    hallucination_risk: float = 0.0  # 0-1


class SignalScores(BaseModel):
    """ANN's proprietary scoring system."""

    signal_score: int = Field(default=0, ge=0, le=100)
    hype_score: int = Field(default=0, ge=0, le=100)
    builder_score: int = Field(default=0, ge=0, le=100)
    security_score: int = Field(default=0, ge=0, le=100)
    open_source_score: int = Field(default=0, ge=0, le=100)
    enterprise_score: int = Field(default=0, ge=0, le=100)
    overall_score: int = Field(default=0, ge=0, le=100)


class RiskAssessment(BaseModel):
    """Risk assessment from oversight agents."""

    risk_level: RiskLevel = RiskLevel.LOW
    risk_factors: List[str] = Field(default_factory=list)
    requires_human_review: bool = False
    legal_concerns: List[str] = Field(default_factory=list)
    bias_concerns: List[str] = Field(default_factory=list)
    safety_flags: List[str] = Field(default_factory=list)


class Story(BaseModel):
    """A story moving through the ANN newsroom pipeline."""

    id: str = Field(default_factory=lambda: f"story_{datetime.utcnow().timestamp()}")
    title: str
    slug: Optional[str] = None
    url: Optional[str] = None
    source_items: List[SourceItem] = Field(default_factory=list)
    primary_source: Optional[SourceItem] = None

    # Content
    summary: Optional[str] = None
    tl_dr: Optional[str] = None
    content: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    category: Optional[Category] = None

    # Pipeline state
    status: StoryStatus = StoryStatus.RAW
    agent_actions: List[AgentAction] = Field(default_factory=list)

    # Scoring
    confidence: Optional[ConfidenceScore] = None
    scores: Optional[SignalScores] = None
    risk: Optional[RiskAssessment] = None

    # Editorial
    headline: Optional[str] = None
    suggested_headlines: List[str] = Field(default_factory=list)

    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    published_at: Optional[datetime] = None
    human_reviewer: Optional[str] = None
    human_notes: Optional[str] = None

    # Transparency
    sources_analyzed: int = 0
    agents_involved: List[AgentRole] = Field(default_factory=list)
    fact_check_status: str = "pending"

    class Config:
        use_enum_values = True
