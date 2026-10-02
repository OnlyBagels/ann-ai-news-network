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

    # Self-hosted models (Ollama, llama.cpp server, LM Studio, vLLM): any
    # OpenAI-compatible /v1 endpoint. Several servers, comma separated, share
    # the load. When set, they take every tier listed in LOCAL_LLM_TIERS
    # ahead of the hosted providers.
    local_llm_base_urls: Optional[str] = Field(default=None, alias="LOCAL_LLM_BASE_URLS")
    local_llm_api_key: Optional[str] = Field(default=None, alias="LOCAL_LLM_API_KEY")
    local_llm_model: str = Field(default="qwen2.5:7b", alias="LOCAL_LLM_MODEL")
    local_llm_premium_model: Optional[str] = Field(default=None, alias="LOCAL_LLM_PREMIUM_MODEL")
    local_llm_tiers: str = Field(default="cheap,long_context,social,premium", alias="LOCAL_LLM_TIERS")
    local_llm_timeout_seconds: float = Field(default=300.0, alias="LOCAL_LLM_TIMEOUT_SECONDS")
    # Sent as reasoning_effort. "none" switches off thinking models' reasoning
    # (Gemma 4 on Ollama); leave empty for servers that reject the field.
    local_llm_reasoning_effort: Optional[str] = Field(default=None, alias="LOCAL_LLM_REASONING_EFFORT")

    # WaterSheep (samratduttaofficial/WaterSheep): a small CPU classifier that
    # votes with the language model on what gets published and what airs.
    # Download it with: python -m ann_agents.llm.watersheep --download
    watersheep_dir: str = Field(default="./models/watersheep", alias="WATERSHEEP_DIR")
    watersheep_threads: int = Field(default=0, alias="WATERSHEEP_THREADS")  # 0 = onnxruntime decides
    # Below this probability an item isn't AI news: not assigned, and rejected
    # if it reaches the editor-in-chief anyway.
    watersheep_min_relevance: float = Field(default=0.5, alias="WATERSHEEP_MIN_RELEVANCE")
    # A summary or an anchor's line needs at least this probability that the
    # source supports it.
    watersheep_min_support: float = Field(default=0.5, alias="WATERSHEEP_MIN_SUPPORT")
    # Headlines above this probability of clickbait go to a human.
    watersheep_max_clickbait: float = Field(default=0.5, alias="WATERSHEEP_MAX_CLICKBAIT")
    # Articles WaterSheep thinks use loaded or one-sided language go to a person.
    watersheep_max_loaded: float = Field(default=0.5, alias="WATERSHEEP_MAX_LOADED")

    # Assignment: how many new items WaterSheep screens per cycle, how many
    # the language model sees to pick from, and whether it picks at all.
    # Feeds that only publish AI news. WaterSheep doesn't screen their items
    # or judge them off-topic: it doesn't know that "Mistral" or "Gemma" is AI.
    newsroom_ai_sources: str = Field(
        default="OpenAI News,Anthropic News,Google AI Blog,Meta AI Blog,Google DeepMind,Mistral AI,"
        "Hugging Face Blog,arXiv,HuggingFace",
        alias="NEWSROOM_AI_SOURCES",
    )
    # Stories need at least this much source text (feed or fetched article)
    # to be written and approved without a person: a headline alone isn't a source.
    newsroom_min_source_chars: int = Field(default=400, alias="NEWSROOM_MIN_SOURCE_CHARS")
    newsroom_screen_max: int = Field(default=300, alias="NEWSROOM_SCREEN_MAX")
    newsroom_shortlist: int = Field(default=40, alias="NEWSROOM_SHORTLIST")
    newsroom_editor_pick: bool = Field(default=True, alias="NEWSROOM_EDITOR_PICK")

    # Fewer agent calls per story (about 5 instead of 14), for CPU models.
    newsroom_lean: bool = Field(default=False, alias="NEWSROOM_LEAN")

    # Live broadcast
    # Who writes the anchors' lines: auto (Claude if ANTHROPIC_API_KEY is
    # set, else local models if LOCAL_LLM_BASE_URLS is set), claude, local,
    # or none (headline reads only).
    broadcast_llm: str = Field(default="auto", alias="BROADCAST_LLM")
    # Who runs the standards desk: same (whoever writes), claude, or local.
    # "claude" with BROADCAST_LLM=local writes on your own servers for free
    # and pays only for the short review.
    broadcast_desk_llm: str = Field(default="same", alias="BROADCAST_DESK_LLM")
    broadcast_local_writer_model: Optional[str] = Field(default=None, alias="BROADCAST_LOCAL_WRITER_MODEL")
    broadcast_local_standards_model: Optional[str] = Field(default=None, alias="BROADCAST_LOCAL_STANDARDS_MODEL")
    # Scripts written at once. Set it to the number of model servers.
    broadcast_writers: int = Field(default=1, alias="BROADCAST_WRITERS")
    broadcast_write_timeout_seconds: float = Field(default=180.0, alias="BROADCAST_WRITE_TIMEOUT_SECONDS")
    # With less than this much queued, air a headline read now instead of
    # waiting on a script. Raise it for slow (CPU) models.
    broadcast_min_runway_seconds: int = Field(default=120, alias="BROADCAST_MIN_RUNWAY_SECONDS")
    broadcast_writer_model: str = Field(default="claude-haiku-4-5", alias="BROADCAST_WRITER_MODEL")
    broadcast_feature_model: str = Field(default="claude-sonnet-5-5", alias="BROADCAST_FEATURE_MODEL")
    broadcast_standards_model: str = Field(default="claude-sonnet-5-5", alias="BROADCAST_STANDARDS_MODEL")
    broadcast_llm_standards: bool = Field(default=True, alias="BROADCAST_LLM_STANDARDS")
    broadcast_daily_budget_usd: float = Field(default=5.0, alias="BROADCAST_DAILY_BUDGET_USD")
    broadcast_viewer_window_seconds: int = Field(default=180, alias="BROADCAST_VIEWER_WINDOW_SECONDS")
    broadcast_lookahead_seconds: int = Field(default=600, alias="BROADCAST_LOOKAHEAD_SECONDS")
    # Keep writing whether or not anyone is watching (a 24-hour channel). Off,
    # the director only writes while a viewer has checked in recently.
    broadcast_always_on: bool = Field(default=True, alias="BROADCAST_ALWAYS_ON")
    # Weather, scores and crypto prices from public APIs for the data hits.
    broadcast_data_desk: bool = Field(default=True, alias="BROADCAST_DATA_DESK")
    broadcast_story_cooldown_hours: int = Field(default=6, alias="BROADCAST_STORY_COOLDOWN_HOURS")
    broadcast_tts: str = Field(default="none", alias="BROADCAST_TTS")  # none | piper
    broadcast_audio_dir: str = Field(default="./broadcast-audio", alias="BROADCAST_AUDIO_DIR")
    broadcast_piper_bin: str = Field(default="piper", alias="BROADCAST_PIPER_BIN")
    broadcast_piper_voices_dir: str = Field(default="./voices", alias="BROADCAST_PIPER_VOICES_DIR")
    broadcast_lineup_path: Optional[str] = Field(default=None, alias="BROADCAST_LINEUP_PATH")

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
