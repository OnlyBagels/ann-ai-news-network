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
    openai_model: str = Field(default="gpt-4o-mini", alias="OPENAI_MODEL")
    # Claude models per tier. Claude stands in for DeepSeek, Gemini and Grok
    # when only ANTHROPIC_API_KEY is set.
    anthropic_cheap_model: str = Field(default="claude-haiku-4-5", alias="ANTHROPIC_CHEAP_MODEL")
    anthropic_premium_model: str = Field(default="claude-sonnet-5-5", alias="ANTHROPIC_PREMIUM_MODEL")

    # Live broadcast
    broadcast_writer_model: str = Field(default="claude-haiku-4-5", alias="BROADCAST_WRITER_MODEL")
    broadcast_feature_model: str = Field(default="claude-sonnet-5-5", alias="BROADCAST_FEATURE_MODEL")
    broadcast_standards_model: str = Field(default="claude-sonnet-5-5", alias="BROADCAST_STANDARDS_MODEL")
    broadcast_llm_standards: bool = Field(default=True, alias="BROADCAST_LLM_STANDARDS")
    broadcast_daily_budget_usd: float = Field(default=5.0, alias="BROADCAST_DAILY_BUDGET_USD")
    broadcast_viewer_window_seconds: int = Field(default=180, alias="BROADCAST_VIEWER_WINDOW_SECONDS")
    broadcast_lookahead_seconds: int = Field(default=150, alias="BROADCAST_LOOKAHEAD_SECONDS")
    broadcast_story_cooldown_hours: int = Field(default=6, alias="BROADCAST_STORY_COOLDOWN_HOURS")
    broadcast_tts: str = Field(default="none", alias="BROADCAST_TTS")  # none | piper
    broadcast_audio_dir: str = Field(default="./broadcast-audio", alias="BROADCAST_AUDIO_DIR")
    broadcast_piper_bin: str = Field(default="piper", alias="BROADCAST_PIPER_BIN")
    broadcast_piper_voices_dir: str = Field(default="./voices", alias="BROADCAST_PIPER_VOICES_DIR")
    broadcast_lineup_path: Optional[str] = Field(default=None, alias="BROADCAST_LINEUP_PATH")

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
