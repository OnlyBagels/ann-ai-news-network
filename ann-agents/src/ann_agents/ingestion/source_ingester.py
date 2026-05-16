"""Source Ingester - Ingests data from RSS, APIs, and scrapers."""

from __future__ import annotations

from datetime import datetime
from typing import AsyncGenerator, List, Optional

from loguru import logger

from ann_agents.core.types import SourceItem


class SourceIngester:
    """Ingests raw data from various sources and normalizes into SourceItems."""

    async def ingest_rss(self, feed_url: str) -> List[SourceItem]:
        """Ingest articles from an RSS/Atom feed."""
        import feedparser

        items: List[SourceItem] = []
        try:
            feed = feedparser.parse(feed_url)
            for entry in feed.entries:
                item = SourceItem(
                    title=entry.get("title", "Untitled"),
                    url=entry.get("link", ""),
                    source_name=feed.feed.get("title", feed_url),
                    source_type="rss",
                    author=entry.get("author"),
                    published_at=self._parse_date(entry.get("published_parsed") or entry.get("updated_parsed")),
                    summary=entry.get("summary", ""),
                    tags=[tag.get("term", "") for tag in entry.get("tags", []) if tag.get("term")],
                )
                items.append(item)
            logger.info(f"Ingested {len(items)} items from RSS: {feed_url}")
        except Exception as e:
            logger.error(f"Failed to ingest RSS {feed_url}: {e}")

        return items

    async def ingest_hn(self, story_id: Optional[int] = None, top_n: int = 30) -> List[SourceItem]:
        """Ingest from Hacker News API."""
        import httpx

        items: List[SourceItem] = []
        try:
            async with httpx.AsyncClient() as client:
                if story_id:
                    ids = [story_id]
                else:
                    resp = await client.get("https://hacker-news.firebaseio.com/v0/topstories.json")
                    ids = resp.json()[:top_n]

                for sid in ids:
                    resp = await client.get(f"https://hacker-news.firebaseio.com/v0/item/{sid}.json")
                    data = resp.json()
                    if data and data.get("type") == "story" and data.get("title"):
                        item = SourceItem(
                            title=data["title"],
                            url=data.get("url", f"https://news.ycombinator.com/item?id={sid}"),
                            source_name="Hacker News",
                            source_type="api",
                            author=data.get("by"),
                            published_at=datetime.fromtimestamp(data.get("time", 0)),
                            summary=data.get("text", ""),
                            tags=["hacker-news"],
                            metadata={"score": data.get("score", 0), "hn_id": sid},
                        )
                        items.append(item)
            logger.info(f"Ingested {len(items)} items from Hacker News")
        except Exception as e:
            logger.error(f"Failed to ingest Hacker News: {e}")

        return items

    async def ingest_arxiv(self, query: str = "cat:cs.AI+OR+cat:cs.LG", max_results: int = 50) -> List[SourceItem]:
        """Ingest papers from arXiv."""
        import arxiv

        items: List[SourceItem] = []
        try:
            search = arxiv.Search(query=query, max_results=max_results, sort_by=arxiv.SortCriterion.SubmittedDate)
            for result in search.results():
                item = SourceItem(
                    title=result.title,
                    url=result.entry_id,
                    source_name="arXiv",
                    source_type="api",
                    author=", ".join(a.name for a in result.authors),
                    published_at=result.published,
                    summary=result.summary,
                    tags=["research", "paper"] + [cat for cat in result.categories],
                    metadata={"arxiv_id": result.entry_id.split("/")[-1]},
                )
                items.append(item)
            logger.info(f"Ingested {len(items)} papers from arXiv")
        except Exception as e:
            logger.error(f"Failed to ingest arXiv: {e}")

        return items

    async def ingest_github_trending(self, language: str = "", since: str = "daily") -> List[SourceItem]:
        """Ingest trending repos from GitHub."""
        import httpx
        from bs4 import BeautifulSoup

        items: List[SourceItem] = []
        url = f"https://github.com/trending/{language}?since={since}"
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(url, headers={"User-Agent": "ANN-Agents/1.0"})
                soup = BeautifulSoup(resp.text, "lxml")
                articles = soup.select("article.Box-row")

                for article in articles:
                    h2 = article.select_one("h2 a")
                    if not h2:
                        continue
                    repo_name = h2.get("href", "").strip("/")
                    desc_el = article.select_one("p")
                    description = desc_el.text.strip() if desc_el else ""
                    stars_el = article.select_one(".d-inline-block.float-sm-right")
                    stars = stars_el.text.strip() if stars_el else "0"

                    item = SourceItem(
                        title=repo_name.split("/")[-1],
                        url=f"https://github.com/{repo_name}",
                        source_name="GitHub Trending",
                        source_type="scraper",
                        published_at=datetime.utcnow(),
                        summary=description,
                        tags=["open-source", "github", language] if language else ["open-source", "github"],
                        metadata={"repo": repo_name, "stars": stars, "language": language},
                    )
                    items.append(item)
            logger.info(f"Ingested {len(items)} repos from GitHub Trending")
        except Exception as e:
            logger.error(f"Failed to ingest GitHub Trending: {e}")

        return items

    async def ingest_huggingface(self, task: Optional[str] = None, limit: int = 30) -> List[SourceItem]:
        """Ingest trending models from HuggingFace."""
        from huggingface_hub import HfApi

        items: List[SourceItem] = []
        try:
            api = HfApi()
            models = api.list_models(
                task=task,
                sort="downloads",
                direction=-1,
                limit=limit,
            )
            for model in models:
                item = SourceItem(
                    title=model.modelId,
                    url=f"https://huggingface.co/{model.modelId}",
                    source_name="HuggingFace",
                    source_type="api",
                    published_at=model.created_at or datetime.utcnow(),
                    summary=model.description or "",
                    tags=["open-source", "model"] + (model.tags or []),
                    metadata={
                        "downloads": getattr(model, "downloads", 0),
                        "likes": getattr(model, "likes", 0),
                        "pipeline_tag": model.pipeline_tag,
                    },
                )
                items.append(item)
            logger.info(f"Ingested {len(items)} models from HuggingFace")
        except Exception as e:
            logger.error(f"Failed to ingest HuggingFace: {e}")

        return items

    def _parse_date(self, date_struct) -> datetime:
        """Parse a time.struct_time or similar into datetime."""
        import time
        if date_struct is None:
            return datetime.utcnow()
        try:
            return datetime.fromtimestamp(time.mktime(date_struct))
        except (TypeError, ValueError, OverflowError):
            return datetime.utcnow()
