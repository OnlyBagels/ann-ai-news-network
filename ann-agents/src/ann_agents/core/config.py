"""Configuration for the ANN agentic newsroom."""

from __future__ import annotations

from typing import Dict, Optional
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Redis
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")
    redis_token: Optional[str] = Field(default=None, alias="REDIS_TOKEN")

    # LLM API Keys
    deepseek_api_key: Optional[str] = Field(default=None, alias="DEEPSEEK_API_KEY")
    gemini_api_key: Optional[str] = Field(default=None, alias="GEMINI_API_KEY")
    grok_api_key: Optional[str] = Field(default=None, alias="GROK_API_KEY")
    openai_api_key: Optional[str] = Field(default=None, alias="OPENAI_API_KEY")
    anthropic_api_key: Optional[str] = Field(default=None, alias="ANTHROPIC_API_KEY")

    # External API Keys
    github_token: Optional[str] = Field(default=None, alias="GITHUB_TOKEN")
    huggingface_token: Optional[str] = Field(default=None, alias="HUGGINGFACE_TOKEN")
    reddit_client_id: Optional[str] = Field(default=None, alias="REDDIT_CLIENT_ID")
    reddit_client_secret: Optional[str] = Field(default=None, alias="REDDIT_CLIENT_SECRET")
    # Optional — WebSearchResearcher prefers Tavily when set, falls back to DDG HTML scrape.
    tavily_api_key: Optional[str] = Field(default=None, alias="TAVILY_API_KEY")

    # Database
    database_url: str = Field(
        default="postgresql://ann:ann_password@localhost:5432/ann?schema=public",
        alias="DATABASE_URL",
    )

    scheduler_enabled: bool = Field(default=True, alias="ANN_SCHEDULER_ENABLED")
    scheduler_interval_minutes: int = Field(default=15, alias="ANN_SCHEDULER_INTERVAL_MINUTES")
    scheduler_startup_delay_seconds: int = Field(default=5, alias="ANN_SCHEDULER_STARTUP_DELAY_SECONDS")
    all_news_limit_per_feed: int = Field(default=8, alias="ANN_ALL_NEWS_LIMIT_PER_FEED")
    include_ai_specialist_sources: bool = Field(default=False, alias="ANN_INCLUDE_AI_SPECIALIST_SOURCES")
    reporter_execution_mode: str = Field(default="all", alias="ANN_REPORTER_EXECUTION_MODE")
    reporter_parallel_limit: int = Field(default=24, alias="ANN_REPORTER_PARALLEL_LIMIT")

    # Secondary reviewer (DigitalOcean Inference, OpenAI-compatible)
    do_reviewer_enabled: bool = Field(default=False, alias="ANN_DO_REVIEWER_ENABLED")
    do_reviewer_base_url: str = Field(default="https://inference.do-ai.run/v1", alias="ANN_DO_REVIEWER_BASE_URL")
    do_reviewer_api_key: Optional[str] = Field(default=None, alias="ANN_DO_REVIEWER_API_KEY")
    do_reviewer_model: str = Field(default="llama3.3-70b-instruct", alias="ANN_DO_REVIEWER_MODEL")
    do_reviewer_timeout_seconds: int = Field(default=20, alias="ANN_DO_REVIEWER_TIMEOUT_SECONDS")

    # Optional auto-approve gate for exceptionally strong drafts.
    # Disabled by default to preserve the human review path.
    auto_approve_enabled: bool = Field(default=False, alias="ANN_AUTO_APPROVE_ENABLED")
    auto_approve_min_confidence: float = Field(default=0.95, alias="ANN_AUTO_APPROVE_MIN_CONFIDENCE")
    auto_approve_max_hallucination_risk: float = Field(default=0.06, alias="ANN_AUTO_APPROVE_MAX_HALLUCINATION_RISK")
    auto_approve_min_verified_claims: int = Field(default=3, alias="ANN_AUTO_APPROVE_MIN_VERIFIED_CLAIMS")
    auto_approve_min_citations: int = Field(default=2, alias="ANN_AUTO_APPROVE_MIN_CITATIONS")
    auto_approve_min_body_chars: int = Field(default=900, alias="ANN_AUTO_APPROVE_MIN_BODY_CHARS")

    # Meilisearch
    meilisearch_host: str = Field(default="http://localhost:7700", alias="MEILISEARCH_HOST")
    meilisearch_api_key: Optional[str] = Field(default=None, alias="MEILISEARCH_API_KEY")

    # Agent configuration
    max_concurrent_stories: int = Field(default=10)
    agent_timeout_seconds: int = Field(default=120)
    human_review_queue_size: int = Field(default=50)

    # LLM Routing
    llm_cheap_model: str = Field(default="deepseek-chat")  # DeepSeek V4 Flash
    llm_long_context_model: str = Field(default="gemini-2.0-flash")  # Gemini Flash
    llm_social_model: str = Field(default="grok-2")  # Grok
    llm_premium_model: str = Field(default="claude-sonnet-4")  # Claude/GPT

    model_config = {"env_file": ".env", "extra": "ignore"}

    @property
    def sqlalchemy_database_url(self) -> str:
        """Normalize Prisma-style DATABASE_URL for SQLAlchemy drivers.

        Prisma commonly appends `?schema=public`, but psycopg/libpq does not
        recognize `schema` as a valid DSN key. Strip it for Python services.
        """
        parsed = urlparse(self.database_url)
        if not parsed.query:
            return self.database_url

        query_items = parse_qsl(parsed.query, keep_blank_values=True)
        filtered = [(key, value) for key, value in query_items if key.lower() != "schema"]
        if len(filtered) == len(query_items):
            return self.database_url

        return urlunparse(parsed._replace(query=urlencode(filtered)))


settings = Settings()
