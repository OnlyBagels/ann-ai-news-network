"""The newsroom's sources, kept in the Source table so editors can manage them.

Each cycle reads the active sources, fetches them, and records how it went:
when a feed last worked, its last error, and how many fetches in a row have
failed. The defaults below are added once; edits made in the admin area win.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List, Optional, Sequence, Tuple

from loguru import logger
from sqlalchemy import text
from sqlalchemy.engine import Engine

from ann_agents.core.types import SourceItem
from ann_agents.ingestion.source_ingester import SourceIngester

# The feeds a new newsroom starts with, as (name, type, url, category,
# ai_only). Names are read on air, so they are the names readers know, not
# whatever the feed calls itself. Each feed was fetched and parsed on
# 2026-10-02 and had a post within the last 60 days. The category is a hint
# for the beat; WaterSheep makes the call per story. ai_only feeds skip the
# "is this about AI?" screen. Anthropic has no official feed, so its two
# entries are the community mirror at github.com/Olshansk/rss-feeds.
DEFAULT_SOURCES: List[Tuple[str, str, Optional[str], Optional[str], bool]] = [
    # models
    ("Ai2 Blog", "rss", "https://allenai.org/rss.xml", "models", True),
    (
        "Anthropic News",
        "rss",
        "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_news.xml",
        "models",
        True,
    ),
    ("Apple Machine Learning Research", "rss", "https://machinelearning.apple.com/rss.xml", "models", True),
    ("Ars Technica AI", "rss", "https://arstechnica.com/ai/feed/", "models", True),
    ("Google AI Blog", "rss", "https://blog.google/innovation-and-ai/technology/ai/rss/", "models", True),
    ("Google DeepMind", "rss", "https://deepmind.google/blog/rss.xml", "models", True),
    ("Microsoft Research Blog", "rss", "https://www.microsoft.com/en-us/research/feed/", "models", True),
    ("Mistral AI", "rss", "https://mistral.ai/news/rss", "models", True),
    (
        "MIT Technology Review AI",
        "rss",
        "https://www.technologyreview.com/topic/artificial-intelligence/feed",
        "models",
        True,
    ),
    ("NVIDIA Blog: Generative AI", "rss", "https://blogs.nvidia.com/blog/category/generative-ai/feed/", "models", True),
    ("One Useful Thing", "rss", "https://www.oneusefulthing.org/feed", "models", True),
    ("OpenAI News", "rss", "https://openai.com/news/rss.xml", "models", True),
    ("Stability AI News", "rss", "https://stability.ai/news-updates?format=rss", "models", True),
    ("TechCrunch AI", "rss", "https://techcrunch.com/category/artificial-intelligence/feed/", "models", True),
    ("The Decoder", "rss", "https://the-decoder.com/feed/", "models", True),
    (
        "The Register AI",
        "rss",
        "https://api.theregister.com/api/v1/article?orderBy=published&site_id=2&remapper=rss&query=(tag:software+AND+tag:%22ai+and+ml%22)",
        "models",
        True,
    ),
    ("The Verge AI", "rss", "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", "models", True),
    ("Wired AI", "rss", "https://www.wired.com/feed/tag/ai/latest/rss", "models", True),
    ("Amazon Science", "rss", "https://www.amazon.science/index.rss", "models", False),
    # open_source
    ("Hugging Face Blog", "rss", "https://huggingface.co/blog/feed.xml", "open_source", True),
    ("Interconnects", "rss", "https://www.interconnects.ai/feed", "open_source", True),
    ("Mozilla.ai Blog", "rss", "https://blog.mozilla.ai/rss/", "open_source", True),
    ("Ollama Blog", "rss", "https://ollama.com/blog/rss.xml", "open_source", True),
    ("Together AI Blog", "rss", "https://www.together.ai/blog/rss.xml", "open_source", True),
    ("vLLM Blog", "rss", "https://vllm.ai/blog/rss.xml", "open_source", True),
    # coding_ai
    ("GitHub Blog: AI & ML", "rss", "https://github.blog/ai-and-ml/feed/", "coding_ai", True),
    ("GitHub Changelog: Copilot", "rss", "https://github.blog/changelog/label/copilot/feed/", "coding_ai", True),
    ("JetBrains AI Blog", "rss", "https://blog.jetbrains.com/ai/feed/", "coding_ai", True),
    (
        "Simon Willison: AI-assisted programming",
        "rss",
        "https://simonwillison.net/tags/ai-assisted-programming.atom",
        "coding_ai",
        True,
    ),
    ("The New Stack AI", "rss", "https://thenewstack.io/category/ai/feed/", "coding_ai", True),
    # agents
    ("AI News (smol.ai)", "rss", "https://news.smol.ai/rss.xml", "agents", True),
    (
        "Claude Blog",
        "rss",
        "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_claude.xml",
        "agents",
        True,
    ),
    ("LangChain Blog", "rss", "https://www.langchain.com/blog/rss.xml", "agents", True),
    ("Latent Space", "rss", "https://www.latent.space/feed", "agents", True),
    ("Model Context Protocol Blog", "rss", "https://blog.modelcontextprotocol.io/index.xml", "agents", True),
    # research
    ("Ahead of AI", "rss", "https://magazine.sebastianraschka.com/feed", "research", True),
    ("Epoch AI", "rss", "https://epochai.substack.com/feed", "research", True),
    ("Google Research Blog", "rss", "https://research.google/blog/rss/", "research", True),
    ("IEEE Spectrum AI", "rss", "https://spectrum.ieee.org/feeds/topic/artificial-intelligence.rss", "research", True),
    ("Import AI", "rss", "https://importai.substack.com/feed", "research", True),
    ("METR", "rss", "https://metr.org/feed.xml", "research", True),
    # security
    ("Adversa AI", "rss", "https://adversa.ai/rss.xml", "security", True),
    ("OWASP GenAI Security Project", "rss", "https://genai.owasp.org/feed/", "security", True),
    (
        "Simon Willison: prompt injection",
        "rss",
        "https://simonwillison.net/tags/prompt-injection.atom",
        "security",
        True,
    ),
    ("Embrace The Red", "rss", "https://embracethered.com/blog/index.xml", "security", False),
    ("tl;dr sec", "rss", "https://rss.beehiiv.com/feeds/xgTKUmMmUm.xml", "security", False),
    ("Trail of Bits Blog", "rss", "https://blog.trailofbits.com/index.xml", "security", False),
    # funding
    ("AI Business", "rss", "https://aibusiness.com/rss.xml", "funding", True),
    ("SiliconANGLE AI", "rss", "https://siliconangle.com/category/ai/feed/", "funding", True),
    ("Crunchbase News AI", "rss", "https://news.crunchbase.com/sections/ai/feed/", "funding", False),
    ("Sifted AI", "rss", "https://sifted.eu/sector/artificial-intelligence/feed", "funding", False),
    ("TechCrunch Venture", "rss", "https://techcrunch.com/category/venture/feed/", "funding", False),
    # regulation
    ("AI Now Institute", "rss", "https://ainowinstitute.org/feed", "regulation", True),
    ("AI Safety Newsletter (CAIS)", "rss", "https://newsletter.safe.ai/feed", "regulation", True),
    ("EU AI Act Newsletter", "rss", "https://artificialintelligenceact.substack.com/feed", "regulation", True),
    ("Transformer", "rss", "https://www.transformernews.ai/feed", "regulation", True),
    (
        "Federal Register: AI",
        "rss",
        "https://www.federalregister.gov/api/v1/documents.rss?conditions%5Bterm%5D=%22artificial+intelligence%22&order=newest",
        "regulation",
        False,
    ),
    ("FTC Press Releases", "rss", "https://www.ftc.gov/feeds/press-release.xml", "regulation", False),
    ("Politico Technology", "rss", "https://rss.politico.com/technology.xml", "regulation", False),
    # not RSS
    ("Hacker News", "hackernews", "https://news.ycombinator.com", None, False),
    ("arXiv", "arxiv", "https://arxiv.org/list/cs.AI/recent", "research", True),
    ("GitHub Trending", "github_trending", "https://github.com/trending", "open_source", False),
    ("HuggingFace", "huggingface", "https://huggingface.co/models", "open_source", True),
]

# Feed URLs that earlier versions seeded and that have since moved. Seeding
# points a source still on one of these at its new URL.
RETIRED_URLS = {
    "https://openai.com/blog/rss.xml",
    "https://blog.google/technology/ai/rss/",
    "https://mistral.ai/news/rss/",
}

FEED_LIMIT = 30


@dataclass
class SourceRow:
    id: str
    name: str
    type: str
    url: Optional[str]
    category: Optional[str]
    ai_only: bool


class SourceRegistry:
    def __init__(self, engine: Engine, ingester: Optional[SourceIngester] = None):
        self.engine = engine
        self.ingester = ingester or SourceIngester()

    def seed(self, sources: Sequence[Tuple[str, str, Optional[str], Optional[str], bool]] = DEFAULT_SOURCES) -> int:
        """Add any default source that isn't in the table yet (matched by name or URL)."""
        added = 0
        with self.engine.begin() as conn:
            for name, kind, url, category, ai_only in sources:
                exists = conn.execute(
                    text('SELECT id, url FROM "Source" WHERE name = :name OR (url IS NOT NULL AND url = :url)'),
                    {"name": name, "url": url},
                ).first()
                if exists:
                    if exists[1] in RETIRED_URLS and url != exists[1]:
                        conn.execute(
                            text('UPDATE "Source" SET url = :url, failures = 0, "lastError" = NULL, '
                                 '"updatedAt" = now() WHERE id = :id'),
                            {"url": url, "id": exists[0]},
                        )
                    continue
                conn.execute(
                    text("""
                        INSERT INTO "Source" (id, name, url, type, category, "aiOnly", "isActive", failures,
                                              "createdAt", "updatedAt")
                        VALUES (gen_random_uuid()::text, :name, :url, :type, :category, :ai_only, true, 0, now(), now())
                    """),
                    {"name": name, "url": url, "type": kind, "category": category, "ai_only": ai_only},
                )
                added += 1
        if added:
            logger.info(f"[sources] added {added} default source(s)")
        return added

    def active(self) -> List[SourceRow]:
        with self.engine.connect() as conn:
            rows = conn.execute(
                text('SELECT id, name, type, url, category, "aiOnly" FROM "Source" WHERE "isActive" ORDER BY name')
            ).fetchall()
        return [SourceRow(*r) for r in rows]

    def record(self, source: SourceRow, items: int, error: Optional[str]) -> None:
        now = datetime.now(timezone.utc)
        with self.engine.begin() as conn:
            if error is None:
                conn.execute(
                    text("""
                        UPDATE "Source" SET "lastFetched" = :now, "lastSuccessAt" = :now, "lastItemCount" = :items,
                               "lastError" = NULL, failures = 0, "updatedAt" = :now WHERE id = :id
                    """),
                    {"now": now, "items": items, "id": source.id},
                )
            else:
                conn.execute(
                    text("""
                        UPDATE "Source" SET "lastFetched" = :now, "lastError" = :error, "lastItemCount" = :items,
                               failures = failures + 1, "updatedAt" = :now WHERE id = :id
                    """),
                    {"now": now, "error": error[:500], "items": items, "id": source.id},
                )

    async def _fetch(self, source: SourceRow) -> List[SourceItem]:
        ing = self.ingester
        if source.type == "rss":
            return await ing.fetch_feed(source.url or "", source.name, FEED_LIMIT)
        if source.type == "hackernews":
            items = await ing.ingest_hn(top_n=30)
        elif source.type == "arxiv":
            items = await ing.ingest_arxiv(max_results=20)
        elif source.type == "github_trending":
            items = await ing.ingest_github_trending()
        elif source.type == "huggingface":
            items = await ing.ingest_huggingface(limit=20)
        else:
            raise ValueError(f"unknown source type {source.type!r}")
        if not items:
            raise RuntimeError("returned no items")
        return items

    async def fetch_all(self, concurrency: int = 8) -> List[SourceItem]:
        """Fetch every active source, a few at a time, recording each one's health."""
        gate = asyncio.Semaphore(concurrency)

        async def one(source: SourceRow) -> List[SourceItem]:
            async with gate:
                try:
                    items = await self._fetch(source)
                except Exception as e:
                    logger.warning(f"[sources] {source.name} failed: {e}")
                    self.record(source, 0, f"{type(e).__name__}: {e}")
                    return []
            for item in items:
                item.source_name = source.name
                item.metadata["source_id"] = source.id
                item.metadata["ai_only"] = source.ai_only
                if source.category:
                    item.metadata["category_hint"] = source.category
            self.record(source, len(items), None)
            return items

        results = await asyncio.gather(*(one(s) for s in self.active()))
        return [item for batch in results for item in batch]
