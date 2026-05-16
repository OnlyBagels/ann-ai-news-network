"""LLM Router - Routes requests to the appropriate model based on task type."""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional

from loguru import logger

from ann_agents.core.config import settings


class LLMTier(str, Enum):
    """Tiers of LLM models for different task types."""

    CHEAP = "cheap"  # DeepSeek V4 Flash - bulk tagging, extraction, classification
    LONG_CONTEXT = "long_context"  # Gemini Flash - clustering, analysis
    SOCIAL = "social"  # Grok - social sentiment, culture
    PREMIUM = "premium"  # Claude/GPT - final editorial, high-quality output


class LLMRouter:
    """Routes LLM requests to the appropriate model based on task complexity."""

    def __init__(self):
        self._clients: Dict[str, Any] = {}

    def _get_client(self, tier: LLMTier) -> Any:
        """Get or create an LLM client for the given tier."""
        if tier == LLMTier.CHEAP and settings.deepseek_api_key:
            return self._get_deepseek_client()
        elif tier == LLMTier.LONG_CONTEXT and settings.gemini_api_key:
            return self._get_gemini_client()
        elif tier == LLMTier.SOCIAL and settings.grok_api_key:
            return self._get_grok_client()
        elif tier == LLMTier.PREMIUM:
            if settings.anthropic_api_key:
                return self._get_anthropic_client()
            elif settings.openai_api_key:
                return self._get_openai_client()
        return None

    def _get_deepseek_client(self) -> Any:
        """Get DeepSeek client (OpenAI-compatible)."""
        from openai import OpenAI
        if "deepseek" not in self._clients:
            self._clients["deepseek"] = OpenAI(
                api_key=settings.deepseek_api_key,
                base_url="https://api.deepseek.com/v1",
            )
        return self._clients["deepseek"]

    def _get_gemini_client(self) -> Any:
        """Get Google Gemini client."""
        from google import genai
        if "gemini" not in self._clients:
            self._clients["gemini"] = genai.Client(api_key=settings.gemini_api_key)
        return self._clients["gemini"]

    def _get_grok_client(self) -> Any:
        """Get Grok client (X.AI, OpenAI-compatible)."""
        from openai import OpenAI
        if "grok" not in self._clients:
            self._clients["grok"] = OpenAI(
                api_key=settings.grok_api_key,
                base_url="https://api.x.ai/v1",
            )
        return self._clients["grok"]

    def _get_anthropic_client(self) -> Any:
        """Get Anthropic Claude client."""
        from anthropic import Anthropic
        if "anthropic" not in self._clients:
            self._clients["anthropic"] = Anthropic(api_key=settings.anthropic_api_key)
        return self._clients["anthropic"]

    def _get_openai_client(self) -> Any:
        """Get OpenAI client."""
        from openai import OpenAI
        if "openai" not in self._clients:
            self._clients["openai"] = OpenAI(api_key=settings.openai_api_key)
        return self._clients["openai"]

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
            temperature: Creativity (0.0 = deterministic, 1.0 = creative)
            max_tokens: Maximum tokens in response
            response_format: Optional format specification (e.g., {"type": "json_object"})

        Returns:
            The model's response text, or None if no client available
        """
        client = self._get_client(tier)
        if client is None:
            logger.warning(f"No API key configured for LLM tier: {tier.value}")
            return None

        try:
            if tier == LLMTier.LONG_CONTEXT:
                return await self._complete_gemini(client, system_prompt, user_prompt, temperature, max_tokens)
            elif tier == LLMTier.PREMIUM and settings.anthropic_api_key:
                return await self._complete_anthropic(client, system_prompt, user_prompt, temperature, max_tokens)
            else:
                return await self._complete_openai_like(client, tier, system_prompt, user_prompt, temperature, max_tokens, response_format)
        except Exception as e:
            logger.error(f"LLM completion failed for tier {tier.value}: {e}")
            return None

    async def _complete_openai_like(
        self, client: Any, tier: LLMTier, system: str, user: str,
        temperature: float, max_tokens: int, response_format: Optional[Dict[str, str]] = None,
    ) -> str:
        """Completion for OpenAI-compatible APIs (DeepSeek, Grok, OpenAI)."""
        model_map = {
            LLMTier.CHEAP: settings.llm_cheap_model,
            LLMTier.SOCIAL: settings.llm_social_model,
            LLMTier.PREMIUM: settings.llm_premium_model,
        }
        model = model_map.get(tier, settings.llm_cheap_model)

        kwargs = {
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
        self, client: Any, system: str, user: str,
        temperature: float, max_tokens: int,
    ) -> str:
        """Completion for Google Gemini."""
        response = client.models.generate_content(
            model=settings.llm_long_context_model,
            contents=user,
            config={
                "system_instruction": system,
                "temperature": temperature,
                "max_output_tokens": max_tokens,
            },
        )
        return response.text

    async def _complete_anthropic(
        self, client: Any, system: str, user: str,
        temperature: float, max_tokens: int,
    ) -> str:
        """Completion for Anthropic Claude."""
        response = client.messages.create(
            model=settings.llm_premium_model,
            system=system,
            messages=[{"role": "user", "content": user}],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.content[0].text


# Global LLM router instance
llm_router = LLMRouter()
