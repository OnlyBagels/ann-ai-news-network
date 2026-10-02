"""Source Ingester - Ingests data from RSS, APIs, and scrapers."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from loguru import logger

from ann_agents.core.types import SourceItem


class SourceIngester:
    """Ingests raw data from various sources and normalizes into SourceItems."""

    async def fetch_feed(self, feed_url: str, source_name: Optional[str] = None, limit: int = 30) -> List[SourceItem]:
        """Fetch an RSS/Atom feed's newest `limit` entries. Raises when the feed can't be read.

        Some feeds serve their whole history (OpenAI's has over a thousand
        posts); only the newest entries matter to a news cycle.
        """
        import feedparser
        import httpx

        async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:
            response = await client.get(feed_url, headers={"User-Agent": "ANN-Newsroom/1.0 (+feed reader)"})
            response.raise_for_status()
        feed = feedparser.parse(response.content)
        if feed.bozo and not feed.entries:
            raise ValueError(f"not a readable feed: {feed.bozo_exception}")

        items: List[SourceItem] = []
        for entry in feed.entries:
            if not entry.get("link"):
                continue
            items.append(SourceItem(
                title=entry.get("title", "Untitled"),
                url=entry.get("link", ""),
                source_name=source_name or feed.feed.get("title", feed_url),
                source_type="rss",
                author=entry.get("author"),
                published_at=self._parse_date(entry.get("published_parsed") or entry.get("updated_parsed")),
                summary=entry.get("summary", ""),
                content=(entry.get("content") or [{}])[0].get("value") or None,
                tags=[tag.get("term", "") for tag in entry.get("tags", []) if tag.get("term")],
            ))
        items.sort(key=lambda i: i.published_at, reverse=True)
        return items[:limit]

    async def ingest_rss(self, feed_url: str, source_name: Optional[str] = None) -> List[SourceItem]:
        """Like fetch_feed, but logs and returns nothing on failure."""
        try:
            items = await self.fetch_feed(feed_url, source_name)
            logger.info(f"Ingested {len(items)} items from RSS: {feed_url}")
            return items
        except Exception as e:
            logger.error(f"Failed to ingest RSS {feed_url}: {e}")
            return []

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

    async def ingest_arxiv(self, query: str = "cat:cs.AI OR cat:cs.LG", max_results: int = 50) -> List[SourceItem]:
        """Ingest papers from arXiv."""
        import arxiv

        items: List[SourceItem] = []
        try:
            search = arxiv.Search(query=query, max_results=max_results, sort_by=arxiv.SortCriterion.SubmittedDate)
            # arxiv 2.x removed Search.results(); a Client runs the search.
            for result in arxiv.Client().results(search):
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
            # huggingface_hub renamed the task filter to pipeline_tag.
            models = api.list_models(
                pipeline_tag=task,
                sort="downloads",
                limit=limit,
            )
            for model in models:
                item = SourceItem(
                    title=model.modelId,
                    url=f"https://huggingface.co/{model.modelId}",
                    source_name="HuggingFace",
                    source_type="api",
                    published_at=getattr(model, "created_at", None) or datetime.utcnow(),
                    summary=getattr(model, "description", None) or "",
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
