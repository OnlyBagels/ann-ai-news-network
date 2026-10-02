"""Fetch an item's article text when the feed only gave a title or a teaser.

Feeds often carry nothing but a headline. Writing from a headline means
writing from nothing, so before a story is written the page is fetched and
its main text extracted with trafilatura.
"""

from __future__ import annotations

import asyncio
import re
from typing import Optional

import httpx
from loguru import logger

from ann_agents.core.types import SourceItem

_TAGS = re.compile(r"<[^>]+>")
MAX_CHARS = 12000


def plain_text(value: Optional[str]) -> str:
    return " ".join(_TAGS.sub(" ", value or "").split())


def source_text(item: Optional[SourceItem]) -> str:
    """The longest text available for an item: fetched article, else feed summary."""
    if item is None:
        return ""
    return max(plain_text(item.content), plain_text(item.summary), key=len)


async def fetch_article_text(item: SourceItem, min_chars: int, timeout: float = 20.0) -> SourceItem:
    """Fill item.content from the page when the feed text is shorter than min_chars."""
    if len(source_text(item)) >= min_chars or not item.url.startswith("http"):
        return item
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=timeout) as client:
            response = await client.get(item.url, headers={"User-Agent": "ANN-Newsroom/1.0 (+article text for summaries)"})
            response.raise_for_status()
            html = response.text
    except httpx.HTTPError as e:
        logger.warning(f"[article-text] could not fetch {item.url}: {e}")
        return item

    import trafilatura

    text = await asyncio.to_thread(
        trafilatura.extract, html, include_comments=False, include_tables=False, favor_precision=True
    )
    if text:
        item.content = text[:MAX_CHARS]
        item.metadata["article_text"] = "fetched"
        logger.info(f"[article-text] {len(text)} chars from {item.url}")
    return item
