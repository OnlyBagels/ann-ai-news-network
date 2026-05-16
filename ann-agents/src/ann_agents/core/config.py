"""Configuration for the ANN agentic newsroom."""

from __future__ import annotations

from typing import Dict, Optional
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

    # Database
    database_url: str = Field(
        default="postgresql://ann:ann_password@localhost:5432/ann?schema=public",
        alias="DATABASE_URL",
    )

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


settings = Settings()
