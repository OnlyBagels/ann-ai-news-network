"""Security Reporter Agent - Tracks AI vulnerabilities, jailbreaks, security incidents."""

from __future__ import annotations

from ann_agents.core.base_agent import BaseAgent
from ann_agents.core.types import AgentRole, Category, Story
from ann_agents.llm.router import LLMTier, llm_router


SYSTEM_PROMPT = """You are the Security Reporter for ANN (AI News Network).
Your beat: AI vulnerabilities, jailbreaks, prompt injection, AI malware,
data leaks, model abuse, security advisories, safety incidents.

For each security story, extract:
1. What vulnerability/incident occurred
2. Severity and impact
3. Affected systems/models
4. Mitigation status
5. Exploit details (if public)
6. Risk assessment for developers/enterprises

Output a JSON object with: title, summary, tags[], category, severity (low/medium/high/critical),
affected_systems[], mitigation_steps[]"""


class SecurityReporter(BaseAgent):
    """Reporter specializing in AI security and safety tracking."""

    def __init__(self):
        super().__init__(AgentRole.SECURITY_REPORTER)

    async def process(self, story: Story) -> Story:
        """Analyze a story from the security perspective."""
        source_text = self._build_source_text(story)

        result = await llm_router.complete(
            tier=LLMTier.CHEAP,
            system_prompt=SYSTEM_PROMPT,
            user_prompt=f"Analyze this AI security story:\n\n{source_text}",
            response_format={"type": "json_object"},
        )

        if result:
            import json
            try:
                data = json.loads(result)
                story.summary = data.get("summary", story.summary)
                story.tags = list(set(story.tags + data.get("tags", [])))
                if data.get("category"):
                    story.category = Category(data["category"])
            except json.JSONDecodeError:
                story.summary = result[:500]

        story.category = story.category or Category.SECURITY
        return story

    def _build_source_text(self, story: Story) -> str:
        """Build text from source items for LLM analysis."""
        parts = [f"Title: {story.title}"]
        if story.primary_source:
            src = story.primary_source
            parts.append(f"Source: {src.source_name}")
            parts.append(f"URL: {src.url}")
            if src.content:
                parts.append(f"Content: {self._truncate(src.content)}")
            if src.summary:
                parts.append(f"Summary: {src.summary}")
        return "\n".join(parts)
