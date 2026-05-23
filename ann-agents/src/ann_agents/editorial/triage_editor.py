"""TriageEditor - the assigning editor.

The old pipeline ran all six beat reporters on every story in parallel.
Wasteful and not how a real newsroom works: an editor reads the incoming
wire, decides if it's worth covering, picks the right beat, and hands it
to one reporter. That reporter then owns the story.

TriageEditor does exactly that. One cheap LLM call up front. Outputs the
assigned reporter role; the pipeline then runs only that reporter instead
of fanning out to six.
"""

from __future__ import annotations

import json
import re
from typing import Optional

from loguru import logger

from ann_agents.core.base_agent import BaseAgent
from ann_agents.core.types import AgentRole, Category, Story, parse_category
from ann_agents.core.voice import apply_voice
from ann_agents.llm.router import LLMTier, llm_router


_BEAT_TO_REPORTER = {
    Category.MODELS: AgentRole.MODEL_REPORTER,
    Category.OPEN_SOURCE: AgentRole.OPEN_SOURCE_REPORTER,
    Category.CODING_AI: AgentRole.MODEL_REPORTER,  # closest match
    Category.AGENTS: AgentRole.OPEN_SOURCE_REPORTER,  # closest match
    Category.RESEARCH: AgentRole.RESEARCH_REPORTER,
    Category.SECURITY: AgentRole.SECURITY_REPORTER,
    Category.REGULATION: AgentRole.REGULATION_REPORTER,
    Category.FUNDING: AgentRole.BUSINESS_REPORTER,
}

_SECTION_TO_REPORTER = {
    "world": AgentRole.WORLD_REPORTER,
    "politics": AgentRole.POLITICS_REPORTER,
    "business": AgentRole.BUSINESS_DESK_REPORTER,
    "tech": AgentRole.TECH_REPORTER,
    "science": AgentRole.SCIENCE_REPORTER,
    "climate": AgentRole.CLIMATE_REPORTER,
    "health": AgentRole.HEALTH_REPORTER,
    "sports": AgentRole.SPORTS_REPORTER,
    "culture": AgentRole.CULTURE_REPORTER,
    "opinion": AgentRole.OPINION_REPORTER,
}

ALL_REPORTER_ROLES = [
    AgentRole.WORLD_REPORTER,
    AgentRole.POLITICS_REPORTER,
    AgentRole.BUSINESS_DESK_REPORTER,
    AgentRole.TECH_REPORTER,
    AgentRole.SCIENCE_REPORTER,
    AgentRole.CLIMATE_REPORTER,
    AgentRole.HEALTH_REPORTER,
    AgentRole.SPORTS_REPORTER,
    AgentRole.CULTURE_REPORTER,
    AgentRole.OPINION_REPORTER,
    AgentRole.MODEL_REPORTER,
    AgentRole.OPEN_SOURCE_REPORTER,
    AgentRole.RESEARCH_REPORTER,
    AgentRole.SECURITY_REPORTER,
    AgentRole.REGULATION_REPORTER,
    AgentRole.BUSINESS_REPORTER,
]


_TRIAGE_PROMPT = """\
You are the Triage Editor at ANN. Incoming wire stories cross your desk.
ANN is a global newsroom covering all beats, all regions, all countries.

For each story you decide five things:

1) Which top-level SECTION owns it. One of:
   world, politics, business, tech, science, climate, health, sports,
   culture, opinion

2) If the section is "tech" and the story is specifically AI-related,
   also pick a CATEGORY for finer routing. One of:
   models, open_source, coding_ai, agents, research, security, funding,
   regulation.
   For non-AI tech stories, or any non-tech section, set category to the
   closest fit or null.

3) Which broad REGION the story centers on. One of:
   us, eu, uk, asia, africa, me, latam, oceania, ru, ua, cn, jp, global

4) Which COUNTRY is the center of gravity, using lowercase 2-letter code
   when clear (for example: us, ca, mx, br, gb, fr, de, in, cn, jp, au).
   Use "global" when no single country dominates.

5) How load-bearing the story is, interest_score 0-100.
   High means readers actively need it today.

Return a JSON object exactly:
{
  "section": "world" | "politics" | "business" | "tech" | "science"
            | "climate" | "health" | "sports" | "culture" | "opinion",
  "category": "models" | "open_source" | "coding_ai" | "agents"
             | "research" | "security" | "funding" | "regulation"
             | null,
  "region": "us" | "eu" | "uk" | "asia" | "africa" | "me" | "latam"
           | "oceania" | "ru" | "ua" | "cn" | "jp" | "global",
  "country": "<2-letter code or global>",
  "interest_score": 0-100,
  "rationale": "one short sentence on section + region + country choice"
}

Be decisive. Single section, region, and country only. No arrays.
"""

_VALID_SECTIONS = {
    "world",
    "politics",
    "business",
    "tech",
    "science",
    "climate",
    "health",
    "sports",
    "culture",
    "opinion",
}
_VALID_REGIONS = {
    "us",
    "eu",
    "uk",
    "asia",
    "africa",
    "me",
    "latam",
    "oceania",
    "ru",
    "ua",
    "cn",
    "jp",
    "global",
}
_COUNTRY_CODE_RE = re.compile(r"^[a-z]{2}$")


def _normalize_country(value: object) -> Optional[str]:
    """Normalize a triage country code to lowercase ISO-like form."""
    if value is None:
        return None

    country = str(value).strip().lower()
    if country == "global":
        return "global"
    if _COUNTRY_CODE_RE.match(country):
        return country
    return None


def _default_country_for_region(region: Optional[str]) -> str:
    """Map singleton regions to country code when triage omits country."""
    if region == "us":
        return "us"
    if region == "uk":
        return "gb"
    if region in {"cn", "jp", "ru", "ua"}:
        return region
    return "global"


class TriageEditor(BaseAgent):
    """Reads an incoming story, picks the beat that owns it."""

    def __init__(self):
        super().__init__(AgentRole.TRIAGE_EDITOR)

    async def process(self, story: Story) -> Story:
        src = story.primary_source
        excerpt = ""
        if src and src.content:
            excerpt = src.content[:1500]
        elif src and src.summary:
            excerpt = src.summary[:1500]

        user_prompt = (
            f"TITLE: {story.title}\n"
            f"SOURCE: {src.source_name if src else 'unknown'}\n"
            f"URL: {src.url if src else 'unknown'}\n"
            f"EXCERPT:\n{excerpt or '(no body - title only)'}"
        )

        result = await llm_router.complete(
            tier=LLMTier.CHEAP,
            system_prompt=apply_voice(_TRIAGE_PROMPT),
            user_prompt=user_prompt,
            response_format={"type": "json_object"},
            max_tokens=360,
        )

        if not result:
            # Graceful fallback: keep caller values when present. If not,
            # fall back to tech/models so the pipeline still produces a draft.
            story.section = story.section or "tech"
            story.region = story.region or "global"
            story.country = story.country or _default_country_for_region(story.region)
            story.category = story.category or Category.MODELS
            return story

        try:
            data = json.loads(result)

            section = (data.get("section") or "").lower().strip()
            if section in _VALID_SECTIONS:
                story.section = section
            else:
                story.section = story.section or "tech"

            region = (data.get("region") or "").lower().strip()
            if region in _VALID_REGIONS:
                story.region = region
            else:
                story.region = story.region or "global"

            country = _normalize_country(data.get("country"))
            if country:
                story.country = country
            else:
                story.country = story.country or _default_country_for_region(story.region)

            # Category is optional now - only set when the story sits in
            # an AI sub-category. Default to MODELS for tech stories that
            # do not specify a sub-category so routing still has a fallback.
            cat = parse_category(data.get("category"))
            if cat:
                story.category = cat
            elif story.section == "tech":
                story.category = story.category or Category.MODELS

            rationale = data.get("rationale") or ""
            interest = data.get("interest_score")
            cat_label = story.category.value if story.category else "-"
            logger.info(
                f"[triage] {story.title[:50]} -> {story.section}/{story.region}/{story.country} "
                f"(cat={cat_label}, interest={interest}) - {rationale[:80]}"
            )
        except json.JSONDecodeError as e:
            logger.warning(f"[triage] bad json from llm: {e}; falling back to tech/models")
            story.section = story.section or "tech"
            story.region = story.region or "global"
            story.country = story.country or _default_country_for_region(story.region)
            story.category = story.category or Category.MODELS

        return story


def assigned_reporter(story: Story) -> Optional[AgentRole]:
    """Map the triaged category to a reporter role.

    Returns None if no reporter handles the category (defensive - the enum
    mapping covers all known categories today).
    """
    section = (story.section or "").lower().strip()
    if section and section != "tech":
        return _SECTION_TO_REPORTER.get(section)

    # Tech desk: prefer explicit AI category route when present.
    if story.category:
        cat = story.category if isinstance(story.category, Category) else Category(story.category)
        return _BEAT_TO_REPORTER.get(cat, AgentRole.MODEL_REPORTER)

    # Non-AI tech or unclassified tech fallback.
    if section == "tech":
        return AgentRole.TECH_REPORTER

    return None


def reporter_roles_for_story(story: Story, execution_mode: str) -> list[AgentRole]:
    """Resolve which reporter roles should run for this story."""
    mode = (execution_mode or "assigned").strip().lower()
    primary = assigned_reporter(story)

    if mode == "all":
        roles: list[AgentRole] = []
        if primary:
            roles.append(primary)
        for role in ALL_REPORTER_ROLES:
            if role not in roles:
                roles.append(role)
        return roles

    if primary is None:
        return []
    return [primary]
