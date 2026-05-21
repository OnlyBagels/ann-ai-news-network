"""LLM Router - routes requests to the appropriate provider based on tier.

Each tier maps to a preferred provider:
- CHEAP        → DeepSeek (chat/V3/V4)
- LONG_CONTEXT → Gemini
- SOCIAL       → Grok
- PREMIUM      → Anthropic, falling back to OpenAI

When the preferred provider has no API key configured, the router falls
back to DeepSeek if its key is available. This lets you run the whole
pipeline against a single provider in early dev (just set
DEEPSEEK_API_KEY and every tier will route through DeepSeek).
"""

from __future__ import annotations

import asyncio
from enum import Enum
from typing import Any, Dict, Optional, Tuple

from loguru import logger

from ann_agents.core.config import settings


class LLMTier(str, Enum):
    """Tiers of LLM models for different task types."""

    CHEAP = "cheap"               # DeepSeek — bulk tagging, extraction, classification
    LONG_CONTEXT = "long_context" # Gemini — clustering, long-doc analysis
    SOCIAL = "social"             # Grok — culture, social sentiment
    PREMIUM = "premium"           # Claude/GPT — final editorial, high-quality output


class LLMRouter:
    """Routes LLM requests to the appropriate provider, with DeepSeek fallback."""

    def __init__(self) -> None:
        self._clients: Dict[str, Any] = {}

    # ─── Client constructors (all return ASYNC clients) ────────────────────

    def _get_deepseek_client(self) -> Any:
        """DeepSeek uses an OpenAI-compatible API."""
        from openai import AsyncOpenAI
        if "deepseek" not in self._clients:
            self._clients["deepseek"] = AsyncOpenAI(
                api_key=settings.deepseek_api_key,
                base_url="https://api.deepseek.com/v1",
            )
        return self._clients["deepseek"]

    def _get_grok_client(self) -> Any:
        """xAI Grok uses an OpenAI-compatible API."""
        from openai import AsyncOpenAI
        if "grok" not in self._clients:
            self._clients["grok"] = AsyncOpenAI(
                api_key=settings.grok_api_key,
                base_url="https://api.x.ai/v1",
            )
        return self._clients["grok"]

    def _get_openai_client(self) -> Any:
        from openai import AsyncOpenAI
        if "openai" not in self._clients:
            self._clients["openai"] = AsyncOpenAI(api_key=settings.openai_api_key)
        return self._clients["openai"]

    def _get_anthropic_client(self) -> Any:
        from anthropic import AsyncAnthropic
        if "anthropic" not in self._clients:
            self._clients["anthropic"] = AsyncAnthropic(api_key=settings.anthropic_api_key)
        return self._clients["anthropic"]

    def _get_gemini_client(self) -> Any:
        """google-genai has a sync API; we wrap calls in asyncio.to_thread."""
        from google import genai
        if "gemini" not in self._clients:
            self._clients["gemini"] = genai.Client(api_key=settings.gemini_api_key)
        return self._clients["gemini"]

    # ─── Routing ───────────────────────────────────────────────────────────

    def _resolve(self, tier: LLMTier) -> Tuple[Optional[Any], LLMTier, str]:
        """Pick a client for the requested tier.

        Returns (client, effective_tier, provider_name). When the preferred
        provider has no key, we fall back to DeepSeek if available so a
        single-key dev setup still runs the full pipeline.
        """
        if tier == LLMTier.CHEAP and settings.deepseek_api_key:
            return self._get_deepseek_client(), LLMTier.CHEAP, "deepseek"
        if tier == LLMTier.LONG_CONTEXT and settings.gemini_api_key:
            return self._get_gemini_client(), LLMTier.LONG_CONTEXT, "gemini"
        if tier == LLMTier.SOCIAL and settings.grok_api_key:
            return self._get_grok_client(), LLMTier.SOCIAL, "grok"
        if tier == LLMTier.PREMIUM:
            if settings.anthropic_api_key:
                return self._get_anthropic_client(), LLMTier.PREMIUM, "anthropic"
            if settings.openai_api_key:
                return self._get_openai_client(), LLMTier.PREMIUM, "openai"

        # Fallback to DeepSeek (single-provider dev mode)
        if settings.deepseek_api_key:
            logger.debug(f"[llm] no provider for tier={tier.value}; falling back to deepseek")
            return self._get_deepseek_client(), LLMTier.CHEAP, "deepseek"

        return None, tier, "none"

    async def complete(
        self,
        tier: LLMTier,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.3,
        max_tokens: int = 2000,
        response_format: Optional[Dict[str, str]] = None,
    ) -> Optional[str]:
        """Send a completion. Returns the response text, or None on failure."""
        client, effective_tier, provider = self._resolve(tier)
        if client is None:
            logger.warning(f"[llm] no client available for tier={tier.value}; skipping")
            return None

        try:
            if provider == "gemini":
                return await self._complete_gemini(client, system_prompt, user_prompt, temperature, max_tokens)
            if provider == "anthropic":
                return await self._complete_anthropic(client, system_prompt, user_prompt, temperature, max_tokens)
            # deepseek / grok / openai — all OpenAI-compatible
            return await self._complete_openai_like(
                client, effective_tier, system_prompt, user_prompt,
                temperature, max_tokens, response_format,
            )
        except Exception as e:
            logger.error(f"[llm] {provider} completion failed for tier {tier.value}: {e}")
            return None

    # ─── Provider-specific completion paths ────────────────────────────────

    async def _complete_openai_like(
        self,
        client: Any,
        tier: LLMTier,
        system: str,
        user: str,
        temperature: float,
        max_tokens: int,
        response_format: Optional[Dict[str, str]] = None,
    ) -> str:
        """Async completion for OpenAI-compatible APIs (DeepSeek, Grok, OpenAI)."""
        model_map = {
            LLMTier.CHEAP: settings.llm_cheap_model,
            LLMTier.SOCIAL: settings.llm_social_model,
            LLMTier.PREMIUM: settings.llm_premium_model,
        }
        model = model_map.get(tier, settings.llm_cheap_model)

        kwargs: Dict[str, Any] = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if response_format:
            kwargs["response_format"] = response_format

        response = await client.chat.completions.create(**kwargs)
        return response.choices[0].message.content or ""

    async def _complete_anthropic(
        self,
        client: Any,
        system: str,
        user: str,
        temperature: float,
        max_tokens: int,
    ) -> str:
        """Async completion for Anthropic Claude."""
        response = await client.messages.create(
            model=settings.llm_premium_model,
            system=system,
            messages=[{"role": "user", "content": user}],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.content[0].text

    async def _complete_gemini(
        self,
        client: Any,
        system: str,
        user: str,
        temperature: float,
        max_tokens: int,
    ) -> str:
        """Gemini's sync call wrapped in asyncio.to_thread to stay non-blocking."""
        def _call() -> str:
            response = client.models.generate_content(
                model=settings.llm_long_context_model,
                contents=user,
                config={
                    "system_instruction": system,
                    "temperature": temperature,
                    "max_output_tokens": max_tokens,
                },
            )
            return response.text or ""
        return await asyncio.to_thread(_call)


# Global router instance.
llm_router = LLMRouter()
