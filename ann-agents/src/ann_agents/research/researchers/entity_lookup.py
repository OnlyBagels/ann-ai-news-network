"""EntityLookupResearcher — scenario-specific lookups for the story's domain.

Tool: pick the lookup that matches the source URL.
- GitHub URL    → repo metadata, recent commits, top issues via API
- arXiv URL     → fetch related papers in the same category
- huggingface.co URL → model metadata via HfApi
- news.ycombinator.com → fetch the HN discussion comments

Each lookup gives the journalist specific structured signal (star count,
license, commit cadence, top maintainer reactions) that a generic web
search wouldn't surface as cleanly.
"""

from __future__ import annotations

import re
from typing import Optional
from urllib.parse import urlparse

import httpx
from loguru import logger

from ann_agents.core.config import settings
from ann_agents.core.types import Story
from ann_agents.core.voice import apply_voice
from ann_agents.llm.router import LLMTier, llm_router


_USER_AGENT = "ANN-Agents/1.0 (+https://github.com/OnlyBagels/ann-ai-news-network)"


async def _github_lookup(repo: str) -> str:
    """Repo metadata + top open issues. Returns markdown-formatted notes."""
    headers = {"User-Agent": _USER_AGENT, "Accept": "application/vnd.github+json"}
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"

    parts: list[str] = []
    try:
        async with httpx.AsyncClient(timeout=10.0, headers=headers) as client:
            meta_resp = await client.get(f"https://api.github.com/repos/{repo}")
            if meta_resp.status_code == 200:
                m = meta_resp.json()
                parts.append(
                    f"REPO: {m.get('full_name')}\n"
                    f"DESC: {m.get('description') or '(none)'}\n"
                    f"STARS: {m.get('stargazers_count')}  "
                    f"FORKS: {m.get('forks_count')}  "
                    f"ISSUES OPEN: {m.get('open_issues_count')}\n"
                    f"LANGUAGE: {m.get('language')}  "
                    f"LICENSE: {(m.get('license') or {}).get('spdx_id', 'none')}\n"
                    f"CREATED: {m.get('created_at', '')[:10]}  "
                    f"PUSHED: {m.get('pushed_at', '')[:10]}\n"
                    f"TOPICS: {', '.join(m.get('topics', [])) or '(none)'}"
                )

            issues_resp = await client.get(
                f"https://api.github.com/repos/{repo}/issues",
                params={"state": "open", "sort": "comments", "per_page": 5},
            )
            if issues_resp.status_code == 200:
                issues = issues_resp.json()
                if issues:
                    parts.append("TOP OPEN ISSUES (by comment count):")
                    for i in issues[:5]:
                        if i.get("pull_request"):
                            continue
                        parts.append(
                            f"- #{i.get('number')} {i.get('title', '')[:120]} "
                            f"({i.get('comments', 0)} comments)"
                        )

            commits_resp = await client.get(
                f"https://api.github.com/repos/{repo}/commits",
                params={"per_page": 5},
            )
            if commits_resp.status_code == 200:
                commits = commits_resp.json()
                if commits:
                    parts.append("RECENT COMMITS:")
                    for c in commits[:5]:
                        msg = (c.get("commit", {}).get("message", "") or "").split("\n")[0]
                        sha = c.get("sha", "")[:7]
                        author = (c.get("commit", {}).get("author") or {}).get("name", "?")
                        parts.append(f"- {sha} {author}: {msg[:120]}")
    except Exception as e:
        logger.warning(f"[entity_lookup] github fetch failed for {repo}: {e}")

    return "\n".join(parts).strip()


async def _arxiv_lookup(arxiv_id: str) -> str:
    """Quick lookup for the paper and a few related in the same primary category."""
    try:
        import arxiv as arxiv_lib
        client = arxiv_lib.Client()
        search = arxiv_lib.Search(id_list=[arxiv_id])
        results = list(client.results(search))
        if not results:
            return ""
        paper = results[0]
        parts = [
            f"PAPER: {paper.title}",
            f"AUTHORS: {', '.join(a.name for a in paper.authors[:6])}",
            f"PUBLISHED: {paper.published.strftime('%Y-%m-%d')}",
            f"CATEGORIES: {', '.join(paper.categories)}",
            f"ABSTRACT:\n{paper.summary[:1200]}",
        ]
        # Related papers in the primary category, last 30 days.
        if paper.categories:
            related = arxiv_lib.Search(
                query=f"cat:{paper.categories[0]}",
                max_results=5,
                sort_by=arxiv_lib.SortCriterion.SubmittedDate,
            )
            related_titles = [
                f"- {r.title} ({r.entry_id.split('/')[-1]})"
                for r in client.results(related)
                if r.entry_id != paper.entry_id
            ][:4]
            if related_titles:
                parts.append("RELATED RECENT IN SAME CATEGORY:")
                parts.extend(related_titles)
        return "\n".join(parts)
    except Exception as e:
        logger.warning(f"[entity_lookup] arxiv fetch failed for {arxiv_id}: {e}")
        return ""


async def _huggingface_lookup(model_id: str) -> str:
    """Model card snippet + downloads + tags."""
    try:
        from huggingface_hub import HfApi
        api = HfApi()
        info = api.model_info(model_id)
        parts = [
            f"MODEL: {info.modelId}",
            f"DOWNLOADS: {getattr(info, 'downloads', 0)}  "
            f"LIKES: {getattr(info, 'likes', 0)}",
            f"PIPELINE: {info.pipeline_tag}",
            f"TAGS: {', '.join((info.tags or [])[:20])}",
        ]
        return "\n".join(parts)
    except Exception as e:
        logger.warning(f"[entity_lookup] hf fetch failed for {model_id}: {e}")
        return ""


async def _hn_comments_lookup(hn_id: int) -> str:
    """Pull top 5 top-level comments on the HN post."""
    parts: list[str] = []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            item_resp = await client.get(
                f"https://hacker-news.firebaseio.com/v0/item/{hn_id}.json"
            )
            if item_resp.status_code != 200:
                return ""
            item = item_resp.json()
            kids = (item.get("kids") or [])[:8]
            if not kids:
                return ""
            parts.append(f"HN DISCUSSION (id={hn_id}, {item.get('descendants', 0)} comments):")
            for kid_id in kids:
                kid_resp = await client.get(
                    f"https://hacker-news.firebaseio.com/v0/item/{kid_id}.json"
                )
                if kid_resp.status_code != 200:
                    continue
                kid = kid_resp.json()
                if kid.get("dead") or kid.get("deleted") or not kid.get("text"):
                    continue
                text = re.sub(r"<[^>]+>", "", kid["text"]).strip()
                if len(text) < 40:
                    continue
                author = kid.get("by", "?")
                parts.append(f"- @{author}: {text[:500]}")
                if len([p for p in parts if p.startswith("- @")]) >= 5:
                    break
    except Exception as e:
        logger.warning(f"[entity_lookup] hn comments fetch failed: {e}")
    return "\n".join(parts)


def _classify_source(story: Story) -> tuple[str, str]:
    """Inspect the source URL and return (kind, identifier)."""
    src = story.primary_source
    if not src or not src.url:
        return ("none", "")
    try:
        parsed = urlparse(src.url)
    except Exception:
        return ("none", "")
    host = (parsed.hostname or "").lower().lstrip("www.")
    path = parsed.path.strip("/")

    if host == "github.com":
        repo = "/".join(path.split("/")[:2])
        if repo and "/" in repo:
            return ("github", repo)
    if host == "arxiv.org":
        # arxiv URLs: /abs/2401.12345 or /pdf/2401.12345
        m = re.search(r"(?:abs|pdf)/(\d+\.\d+)", path)
        if m:
            return ("arxiv", m.group(1))
    if host == "huggingface.co":
        # /<org>/<model> or /<user>/<model>
        parts = path.split("/")
        if len(parts) >= 2:
            return ("huggingface", "/".join(parts[:2]))
    if host == "news.ycombinator.com":
        m = re.search(r"id=(\d+)", parsed.query)
        if m:
            return ("hn", m.group(1))
    # Some HN items live in metadata
    if src.metadata.get("hn_id"):
        return ("hn", str(src.metadata["hn_id"]))
    return ("none", "")


class EntityLookupResearcher:
    name = "entity_lookup_researcher"

    async def research(self, story: Story) -> str:
        kind, ident = _classify_source(story)
        if kind == "none" or not ident:
            return ""

        logger.info(f"[{self.name}] kind={kind} ident={ident}")
        raw = ""
        if kind == "github":
            raw = await _github_lookup(ident)
        elif kind == "arxiv":
            raw = await _arxiv_lookup(ident)
        elif kind == "huggingface":
            raw = await _huggingface_lookup(ident)
        elif kind == "hn":
            try:
                raw = await _hn_comments_lookup(int(ident))
            except ValueError:
                raw = ""

        if not raw.strip():
            return ""

        # LLM pass to distill the raw structured data into prose notes.
        synthesis_prompt = (
            f"You are turning structured entity data ({kind}) into journalist\n"
            "research notes. Surface the most load-bearing facts: numbers,\n"
            "dates, names, license, sentiment from comments. Keep it to 1-2\n"
            "paragraphs of prose. Cite specific values; do not invent."
        )
        notes = await llm_router.complete(
            tier=LLMTier.CHEAP,
            system_prompt=apply_voice(synthesis_prompt),
            user_prompt=(
                f"STORY: {story.title}\n\n"
                f"RAW {kind.upper()} DATA:\n{raw[:6000]}"
            ),
            temperature=0.3,
            max_tokens=500,
        )
        return (notes or "").strip()
