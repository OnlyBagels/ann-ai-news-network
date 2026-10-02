"""Self-hosted models: Ollama, llama.cpp's server, LM Studio, vLLM.

All of them serve an OpenAI-compatible /v1/chat/completions, so one client
covers them. LOCAL_LLM_BASE_URLS takes several servers separated by commas;
requests rotate across them and skip a server that is down, so adding a CPU
box adds capacity.
"""

from __future__ import annotations

import itertools
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from loguru import logger

from ann_agents.core.config import settings


@dataclass
class LocalReply:
    text: str
    input_tokens: int
    output_tokens: int
    server: str


def parse_urls(value: Optional[str]) -> List[str]:
    return [u.strip().rstrip("/") for u in (value or "").split(",") if u.strip()]


class LocalModelPool:
    def __init__(self, base_urls: List[str], api_key: Optional[str] = None, timeout: float = 300.0, client_factory=None):
        if not base_urls:
            raise ValueError("LocalModelPool needs at least one base URL")
        if client_factory is None:
            from openai import AsyncOpenAI

            def client_factory(url):
                # Servers that don't check keys still need a non-empty one.
                return AsyncOpenAI(base_url=url, api_key=api_key or "local", timeout=timeout, max_retries=0)

        self.urls = base_urls
        self.clients = [client_factory(url) for url in base_urls]
        self._order = itertools.cycle(range(len(base_urls)))

    async def chat(
        self,
        model: str,
        system: str,
        user: str,
        max_tokens: int = 2000,
        temperature: float = 0.4,
        response_format: Optional[Dict[str, Any]] = None,
    ) -> LocalReply:
        """One completion, from the next server in turn; on failure, the one after."""
        start = next(self._order)
        last_error: Optional[Exception] = None
        for step in range(len(self.clients)):
            i = (start + step) % len(self.clients)
            kwargs: Dict[str, Any] = {
                "model": model,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                "max_tokens": max_tokens,
                "temperature": temperature,
            }
            if response_format:
                kwargs["response_format"] = response_format
            try:
                response = await self.clients[i].chat.completions.create(**kwargs)
            except Exception as e:  # connection refused, timeout, 5xx: try the next box
                logger.warning(f"[local-llm] {self.urls[i]} failed: {e}")
                last_error = e
                continue
            usage = getattr(response, "usage", None)
            return LocalReply(
                text=response.choices[0].message.content or "",
                input_tokens=getattr(usage, "prompt_tokens", 0) or 0,
                output_tokens=getattr(usage, "completion_tokens", 0) or 0,
                server=self.urls[i],
            )
        raise RuntimeError(f"every local model server failed; last error: {last_error}")


def json_schema_format(name: str, schema: Dict[str, Any]) -> Dict[str, Any]:
    """response_format that makes Ollama, llama.cpp and vLLM constrain output to a schema."""
    return {"type": "json_schema", "json_schema": {"name": name, "schema": schema, "strict": True}}


_pool: Optional[LocalModelPool] = None


def local_pool() -> Optional[LocalModelPool]:
    """The shared pool from settings, or None when no local server is configured."""
    global _pool
    urls = parse_urls(settings.local_llm_base_urls)
    if not urls:
        return None
    if _pool is None or _pool.urls != urls:
        _pool = LocalModelPool(urls, settings.local_llm_api_key, settings.local_llm_timeout_seconds)
    return _pool
