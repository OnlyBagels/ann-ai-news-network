"""WebSearchResearcher — uses a web search tool to find related coverage.

Tool: Tavily when TAVILY_API_KEY is set (better ranking, AI-tuned),
DuckDuckGo HTML scrape otherwise (free, no key, rate-limited but OK
for 10 stories per ingest run).

Pipeline:
1. LLM generates 3 distinct search queries from the story title.
2. Run the queries against the search tool in parallel.
3. trafilatura fetches the top results' actual body text.
4. LLM synthesizes the fetched content into 1-2 paragraphs of notes.
"""

from __future__ import annotations

import asyncio
import json
import re
from typing import List, Optional
from urllib.parse import unquote

import httpx
from loguru import logger

from ann_agents.core.config import settings
from ann_agents.core.types import Story
from ann_agents.core.voice import apply_voice
from ann_agents.ingestion.source_ingester import fetch_article_content
from ann_agents.llm.router import LLMTier, llm_router


_USER_AGENT = "ANN-Agents/1.0 (+https://github.com/OnlyBagels/ann-ai-news-network)"


async def _tavily_search(query: str, max_results: int = 5) -> List[dict]:
    """POST to Tavily's search endpoint. Empty list on any failure."""
    if not settings.tavily_api_key:
        return []
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                "https://api.tavily.com/search",
                json={
                    "query": query,
                    "max_results": max_results,
                    "search_depth": "basic",
                    "include_answer": False,
                },
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {settings.tavily_api_key}",
                },
            )
        if resp.status_code != 200:
            logger.warning(f"[web_search] tavily {resp.status_code}: {resp.text[:200]}")
            return []
        return resp.json().get("results", [])[:max_results]
    except Exception as e:
        logger.warning(f"[web_search] tavily call failed: {e}")
        return []


async def _ddg_search(query: str, max_results: int = 5) -> List[dict]:
    """Scrape DuckDuckGo's HTML results page.

    No API key required. Returns same shape as Tavily: list of
    {title, url, content} dicts. content here is the SERP snippet
    (short); trafilatura fetches the actual body in the caller.
    """
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            resp = await client.post(
                "https://html.duckduckgo.com/html/",
                data={"q": query},
                headers={
                    "User-Agent": _USER_AGENT,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            )
        if resp.status_code != 200:
            logger.debug(f"[web_search] ddg {resp.status_code}")
            return []
        html = resp.text
    except Exception as e:
        logger.warning(f"[web_search] ddg fetch failed: {e}")
        return []

    # Parse with regex — DDG's HTML is consistent enough and we don't want
    # to depend on a parser here. Block-level: each result is a <div class="result">.
    results: List[dict] = []
    for match in re.finditer(
        r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>.*?'
        r'<a[^>]+class="result__snippet"[^>]*>(.*?)</a>',
        html,
        flags=re.DOTALL,
    ):
        raw_url, title_html, snippet_html = match.groups()
        # DDG wraps real URLs in /l/?uddg=<encoded>. Strip the wrapper.
        url_match = re.search(r"uddg=([^&]+)", raw_url)
        url = unquote(url_match.group(1)) if url_match else raw_url
        title = re.sub(r"<[^>]+>", "", title_html).strip()
        snippet = re.sub(r"<[^>]+>", "", snippet_html).strip()
        if url and title:
            results.append({"title": title, "url": url, "content": snippet})
        if len(results) >= max_results:
            break
    return results


async def _search(query: str, max_results: int = 5) -> List[dict]:
    """Pick Tavily when available, fall back to DDG."""
    if settings.tavily_api_key:
        results = await _tavily_search(query, max_results)
        if results:
            return results
    return await _ddg_search(query, max_results)


async def _generate_queries(story: Story) -> List[str]:
    """One LLM call to turn a story into 3 distinct search queries."""
    src = story.primary_source
    excerpt = ""
    if src and src.content:
        excerpt = src.content[:1200]
    elif src and src.summary:
        excerpt = src.summary[:600]

    role_prompt = (
        "You generate web search queries for a journalist researching a story.\n"
        "Produce 3 distinct queries that approach the story from different\n"
        "angles: (1) the entity/product itself, (2) competing or related work,\n"
        "(3) a specific claim or number to verify.\n\n"
        "Return ONLY a JSON object: {\"queries\": [\"q1\", \"q2\", \"q3\"]}\n"
        "Each query: 4-10 words. No prose preamble."
    )
    user_prompt = (
        f"TITLE: {story.title}\n"
        f"BEAT: {story.category.value if story.category else 'unknown'}\n"
        f"EXCERPT:\n{excerpt or '(no body — title only)'}"
    )
    result = await llm_router.complete(
        tier=LLMTier.CHEAP,
        system_prompt=apply_voice(role_prompt),
        user_prompt=user_prompt,
        response_format={"type": "json_object"},
        max_tokens=300,
    )
    if not result:
        return [story.title]
    try:
        data = json.loads(result)
        queries = data.get("queries", [])
        cleaned = [q for q in queries if isinstance(q, str) and q.strip()]
        return cleaned[:3] if cleaned else [story.title]
    except json.JSONDecodeError:
        return [story.title]


class WebSearchResearcher:
    """Plain class (not BaseAgent) — orchestrated by JournalistResearcher."""

    name = "web_search_researcher"

    async def research(self, story: Story) -> str:
        """Return research notes as a string. Empty string on no findings."""
        queries = await _generate_queries(story)
        logger.info(
            f"[{self.name}] {len(queries)} queries: {queries}"
        )

        # Run searches in parallel.
        search_results = await asyncio.gather(
            *(_search(q, max_results=4) for q in queries),
            return_exceptions=False,
        )

        # Deduplicate by URL across all queries; fetch top 5 bodies.
        seen: set[str] = set()
        sources_for_fetch: List[dict] = []
        for results in search_results:
            for r in results:
                url = r.get("url", "")
                if not url or url in seen:
                    continue
                seen.add(url)
                sources_for_fetch.append(r)
        sources_for_fetch = sources_for_fetch[:5]

        if not sources_for_fetch:
            return ""

        # Pull each result's body via trafilatura in parallel.
        bodies = await asyncio.gather(
            *(fetch_article_content(s["url"]) for s in sources_for_fetch),
            return_exceptions=False,
        )

        # Build raw notes block (LLM digests this into a summary next).
        raw_lines: List[str] = []
        for src, body in zip(sources_for_fetch, bodies):
            text = (body or src.get("content", "")).strip()
            if not text:
                continue
            raw_lines.append(f"### [{src.get('title', 'untitled')}]({src['url']})")
            raw_lines.append(text[:1500])
            raw_lines.append("")
        if not raw_lines:
            return ""
        raw_block = "\n".join(raw_lines)

        # Final LLM synthesis pass — 1-2 paragraphs of distilled notes.
        synthesis_prompt = (
            "You are summarizing the results of a web search for a journalist.\n"
            "Distill the raw search results into 2-3 short paragraphs of notes.\n"
            "Surface specific names, numbers, dates, and direct quotes.\n"
            "When sources disagree, flag the disagreement.\n"
            "Cite source titles inline like (Source Title) — do not invent\n"
            "facts not present in the results.\n"
        )
        notes = await llm_router.complete(
            tier=LLMTier.CHEAP,
            system_prompt=apply_voice(synthesis_prompt),
            user_prompt=(
                f"STORY: {story.title}\n\n"
                f"RAW SEARCH RESULTS:\n{raw_block[:8000]}"
            ),
            temperature=0.3,
            max_tokens=800,
        )
        return (notes or "").strip()
