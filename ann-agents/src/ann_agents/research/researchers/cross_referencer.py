"""CrossReferenceResearcher — follows links from the source body.

Tool: URL extraction + trafilatura. When the source article cites a
benchmark, links a paper, or references a previous post, we fetch those
linked pages and use them as additional evidence.

This catches the "blog post says 'see our benchmark at X for details'"
case — without following X we'd miss the actual numbers.
"""

from __future__ import annotations

import asyncio
import re
from typing import List, Set
from urllib.parse import urlparse

from loguru import logger

from ann_agents.core.types import Story
from ann_agents.core.voice import apply_voice
from ann_agents.ingestion.source_ingester import fetch_article_content
from ann_agents.llm.router import LLMTier, llm_router


# Match markdown links [text](url), html href="url", and bare http(s)://...
_URL_RE = re.compile(
    r'\]\((https?://[^\s\)]+)\)|href="(https?://[^"]+)"|(?<![\w"\'])(https?://[^\s\)<>"\']+)',
    re.IGNORECASE,
)

# Domains to skip (assets, trackers, social share buttons, the source itself).
_SKIP_DOMAINS = {
    "twitter.com", "x.com", "facebook.com", "linkedin.com", "youtube.com",
    "googletagmanager.com", "google-analytics.com", "doubleclick.net",
    "cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com",
    "raw.githubusercontent.com",  # raw repo files, not articles
}


def _extract_urls(text: str, exclude_host: str = "") -> List[str]:
    """Pull http(s) URLs from prose, skipping noise + the source's own host."""
    if not text:
        return []
    urls: List[str] = []
    seen: Set[str] = set()
    for m in _URL_RE.finditer(text):
        url = next((g for g in m.groups() if g), None)
        if not url:
            continue
        url = url.rstrip(".,;:!?)")
        if url in seen:
            continue
        seen.add(url)
        try:
            host = urlparse(url).hostname or ""
        except Exception:
            continue
        host = host.lower().lstrip("www.")
        if not host:
            continue
        if exclude_host and exclude_host in host:
            continue
        if host in _SKIP_DOMAINS:
            continue
        # Skip image/asset extensions
        path = urlparse(url).path.lower()
        if any(path.endswith(ext) for ext in (".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".css", ".js")):
            continue
        urls.append(url)
    return urls


class CrossReferenceResearcher:
    name = "cross_ref_researcher"

    async def research(self, story: Story) -> str:
        src = story.primary_source
        if not src or not src.content:
            return ""

        source_host = ""
        if src.url:
            try:
                source_host = (urlparse(src.url).hostname or "").lower().lstrip("www.")
            except Exception:
                source_host = ""

        urls = _extract_urls(src.content, exclude_host=source_host)[:4]
        if not urls:
            return ""

        logger.info(f"[{self.name}] following {len(urls)} links from source body")

        bodies = await asyncio.gather(
            *(fetch_article_content(u) for u in urls),
            return_exceptions=False,
        )

        raw_lines: List[str] = []
        for url, body in zip(urls, bodies):
            text = (body or "").strip()
            if len(text) < 200:
                continue
            raw_lines.append(f"### {url}")
            raw_lines.append(text[:1500])
            raw_lines.append("")
        if not raw_lines:
            return ""
        raw_block = "\n".join(raw_lines)

        synthesis_prompt = (
            "You are summarizing pages the source article linked to.\n"
            "Each linked page gives extra evidence for the journalist's story.\n"
            "Write 1-2 short paragraphs noting what each linked page adds —\n"
            "specific numbers, quoted text, supporting documents, related\n"
            "products, benchmarks, papers.\n"
            "Cite the URL inline. Do not invent details not in the pages.\n"
        )
        notes = await llm_router.complete(
            tier=LLMTier.CHEAP,
            system_prompt=apply_voice(synthesis_prompt),
            user_prompt=(
                f"STORY: {story.title}\n\n"
                f"LINKED PAGES FROM SOURCE BODY:\n{raw_block[:8000]}"
            ),
            temperature=0.3,
            max_tokens=600,
        )
        return (notes or "").strip()
