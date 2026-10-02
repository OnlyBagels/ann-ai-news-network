"""LLM Router - Routes requests to the appropriate model based on task type."""

from __future__ import annotations

import json
import re
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

from loguru import logger

from ann_agents.core.config import settings


class LLMTier(str, Enum):
    """Tiers of LLM models for different task types."""

    CHEAP = "cheap"  # DeepSeek V4 Flash - bulk tagging, extraction, classification
    LONG_CONTEXT = "long_context"  # Gemini Flash - clustering, analysis
    SOCIAL = "social"  # Grok - social sentiment, culture
    PREMIUM = "premium"  # Claude/GPT - final editorial, high-quality output


# Provider preference per tier. The first provider with a key wins, so a
# deployment with only ANTHROPIC_API_KEY set still runs every agent.
TIER_PROVIDERS: Dict[LLMTier, List[str]] = {
    LLMTier.CHEAP: ["deepseek", "anthropic", "openai"],
    LLMTier.LONG_CONTEXT: ["gemini", "anthropic", "openai"],
    LLMTier.SOCIAL: ["grok", "anthropic", "openai"],
    LLMTier.PREMIUM: ["anthropic", "openai"],
}

_JSON_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


def extract_json_text(text: str) -> str:
    """Return the JSON object inside a model reply.

    Claude has no json_object response mode, so a reply can arrive wrapped
    in a code fence or with a sentence in front of it.
    """
    stripped = _JSON_FENCE.sub("", text.strip())
    try:
        json.loads(stripped)
        return stripped
    except json.JSONDecodeError:
        pass
    start, end = stripped.find("{"), stripped.rfind("}")
    if start != -1 and end > start:
        return stripped[start : end + 1]
    return stripped


class LLMRouter:
    """Routes LLM requests to the appropriate model based on task complexity."""

    def __init__(self):
        self._clients: Dict[str, Any] = {}

    def _has_key(self, provider: str) -> bool:
        return bool(getattr(settings, f"{provider}_api_key", None))

    def _resolve(self, tier: LLMTier) -> Optional[Tuple[str, Any]]:
        """Pick the first configured provider for a tier."""
        for provider in TIER_PROVIDERS[tier]:
            if self._has_key(provider):
                return provider, self._get_client(provider)
        return None

    def _get_client(self, provider: str) -> Any:
        if provider in self._clients:
            return self._clients[provider]

        if provider == "anthropic":
            from anthropic import AsyncAnthropic

            client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        elif provider == "gemini":
            from google import genai

            client = genai.Client(api_key=settings.gemini_api_key)
        else:
            from openai import AsyncOpenAI

            base_urls = {
                "deepseek": "https://api.deepseek.com/v1",
                "grok": "https://api.x.ai/v1",
                "openai": None,
            }
            client = AsyncOpenAI(
                api_key=getattr(settings, f"{provider}_api_key"),
                base_url=base_urls[provider],
            )

        self._clients[provider] = client
        return client

    def _model_for(self, provider: str, tier: LLMTier) -> str:
        if provider == "anthropic":
            if tier in (LLMTier.CHEAP, LLMTier.SOCIAL):
                return settings.anthropic_cheap_model
            return settings.anthropic_premium_model
        if provider == "openai":
            return settings.openai_model
        if provider == "gemini":
            return settings.llm_long_context_model
        if provider == "grok":
            return settings.llm_social_model
        return settings.llm_cheap_model

    async def complete(
        self,
        tier: LLMTier,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.3,
        max_tokens: int = 2000,
        response_format: Optional[Dict[str, str]] = None,
    ) -> Optional[str]:
        """Send a completion request to the appropriate LLM tier.

        Args:
            tier: Which LLM tier to use
            system_prompt: System-level instructions
            user_prompt: The user's request
            temperature: Creativity (0.0 = deterministic, 1.0 = creative).
                Not sent to Claude: current Claude models reject it.
            max_tokens: Maximum tokens in response
            response_format: Optional format specification (e.g., {"type": "json_object"})

        Returns:
            The model's response text, or None if no provider is configured
            or the request failed
        """
        resolved = self._resolve(tier)
        if resolved is None:
            logger.warning(f"No API key configured for LLM tier: {tier.value}")
            return None
        provider, client = resolved
        model = self._model_for(provider, tier)
        wants_json = bool(response_format and response_format.get("type") == "json_object")

        try:
            if provider == "anthropic":
                text = await self._complete_anthropic(client, model, system_prompt, user_prompt, max_tokens, wants_json)
            elif provider == "gemini":
                text = await self._complete_gemini(client, model, system_prompt, user_prompt, temperature, max_tokens)
            else:
                text = await self._complete_openai_like(
                    client, model, system_prompt, user_prompt, temperature, max_tokens, response_format
                )
        except Exception as e:
            logger.error(f"LLM completion failed for tier {tier.value} via {provider}: {e}")
            return None

        if text is not None and wants_json:
            text = extract_json_text(text)
        return text

    async def _complete_openai_like(
        self, client: Any, model: str, system: str, user: str,
        temperature: float, max_tokens: int, response_format: Optional[Dict[str, str]] = None,
    ) -> str:
        """Completion for OpenAI-compatible APIs (DeepSeek, Grok, OpenAI)."""
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

    async def _complete_gemini(
        self, client: Any, model: str, system: str, user: str,
        temperature: float, max_tokens: int,
    ) -> str:
        """Completion for Google Gemini."""
        response = await client.aio.models.generate_content(
            model=model,
            contents=user,
            config={
                "system_instruction": system,
                "temperature": temperature,
                "max_output_tokens": max_tokens,
            },
        )
        return response.text or ""

    async def _complete_anthropic(
        self, client: Any, model: str, system: str, user: str,
        max_tokens: int, wants_json: bool,
    ) -> Optional[str]:
        """Completion for Anthropic Claude."""
        if wants_json:
            system = f"{system}\n\nReply with the JSON object only: no code fence, no text before or after it."
        response = await client.messages.create(
            model=model,
            system=system,
            messages=[{"role": "user", "content": user}],
            max_tokens=max_tokens,
        )
        if response.stop_reason == "refusal":
            logger.warning(f"Claude declined a request on {model}")
            return None
        return "".join(block.text for block in response.content if block.type == "text")


# Global LLM router instance
llm_router = LLMRouter()
