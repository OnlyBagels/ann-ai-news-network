"""Story Pipeline - orchestrates ANN's full newsroom workflow."""

from __future__ import annotations

import asyncio
from datetime import datetime

from loguru import logger

from ann_agents.bridge.publisher import publisher
from ann_agents.core.config import settings
from ann_agents.core.types import AgentRole, Story, StoryStatus
from ann_agents.editorial.article_writer import ArticleWriter
from ann_agents.editorial.editorial_agents import (
    HeadlineEditor,
    SummaryEditor,
    StyleEditor,
    TechnicalEditor,
)
from ann_agents.editorial.triage_editor import (
    TriageEditor,
    assigned_reporter,
    reporter_roles_for_story,
)
from ann_agents.factcheck.fact_check_agent import FactCheckAgent
from ann_agents.oversight.oversight_agents import (
    BiasAgent,
    EditorInChief,
    LegalAgent,
    RiskAgent,
)
from ann_agents.reporters.business_reporter import BusinessReporter
from ann_agents.reporters.model_reporter import ModelReporter
from ann_agents.reporters.open_source_reporter import OpenSourceReporter
from ann_agents.reporters.regulation_reporter import RegulationReporter
from ann_agents.reporters.research_reporter import ResearchReporter
from ann_agents.reporters.section_reporters import build_section_reporters
from ann_agents.reporters.security_reporter import SecurityReporter
from ann_agents.research.journalist_research import JournalistResearcher
from ann_agents.research.research_agent import ResearchAgent


class StoryPipeline:
    """Runs stories through triage, desks, research, editorial, and oversight."""

    def __init__(self):
        self.triage_editor = TriageEditor()
        self.journalist_researcher = JournalistResearcher()

        # Reporter desks (section-wide + AI specialist beats).
        self.reporters = {
            **build_section_reporters(),
            AgentRole.MODEL_REPORTER: ModelReporter(),
            AgentRole.OPEN_SOURCE_REPORTER: OpenSourceReporter(),
            AgentRole.RESEARCH_REPORTER: ResearchReporter(),
            AgentRole.SECURITY_REPORTER: SecurityReporter(),
            AgentRole.REGULATION_REPORTER: RegulationReporter(),
            AgentRole.BUSINESS_REPORTER: BusinessReporter(),
        }

        self.research_agent = ResearchAgent()
        self.fact_check_agent = FactCheckAgent()
        self.article_writer = ArticleWriter()

        self.editorial_agents = {
            AgentRole.HEADLINE_EDITOR: HeadlineEditor(),
            AgentRole.TECHNICAL_EDITOR: TechnicalEditor(),
            AgentRole.STYLE_EDITOR: StyleEditor(),
            AgentRole.SUMMARY_EDITOR: SummaryEditor(),
        }

        self.oversight_agents = {
            AgentRole.RISK_AGENT: RiskAgent(),
            AgentRole.LEGAL_AGENT: LegalAgent(),
            AgentRole.BIAS_AGENT: BiasAgent(),
            AgentRole.EDITOR_IN_CHIEF: EditorInChief(),
        }

    async def run_full_pipeline(self, story: Story) -> Story:
        """Run the complete newsroom pipeline for one story."""
        logger.info(f"=== Starting pipeline for story: {story.title[:60]} ===")
        story.status = StoryStatus.INVESTIGATING

        # Step 0: triage for section/category/region/country.
        story = await self.triage_editor.run(story)

        # Step 1: reporter desk pass (single-assigned or full parallel desk).
        story = await self._run_reporters(story)
        story.status = StoryStatus.ENRICHED

        # Step 1b: 3-researcher journalist pass.
        if story.primary_source is None:
            logger.info(
                f"[pipeline] no primary_source for '{story.title[:60]}' "
                "-> running in research-first (assignment) mode"
            )
        story = await self.journalist_researcher.run(story)

        # Step 2: research enrichment.
        story = await self.research_agent.run(story)

        # Step 3: fact-check.
        story = await self.fact_check_agent.run(story)
        story.status = StoryStatus.VERIFIED

        # Step 4: editorial parallel pass.
        story = await self._run_editorial(story)

        # Step 4b: full-article writer.
        story = await self.article_writer.run(story)
        story.status = StoryStatus.EDITED

        # Step 5: oversight pass.
        story = await self._run_oversight(story)
        story.status = StoryStatus.REVIEWED

        # Step 6: final EIC decision.
        story = await self.oversight_agents[AgentRole.EDITOR_IN_CHIEF].run(story)

        # Step 7: publish draft to ann-web review queue.
        try:
            await publisher.publish(story)
        except Exception as exc:
            logger.error(f"[pipeline] publisher raised: {exc}")

        logger.info(
            f"=== Pipeline complete for: {story.title[:60]} === "
            f"Status: {story.status.value}, "
            f"Agents: {len(story.agents_involved)}, "
            f"Confidence: {story.confidence.overall_confidence if story.confidence else 'N/A'}"
        )
        return story

    async def _run_reporters(self, story: Story) -> Story:
        """Run reporter desks using ANN_REPORTER_EXECUTION_MODE."""
        roles = reporter_roles_for_story(story, settings.reporter_execution_mode)
        if not roles:
            logger.info(
                f"[pipeline] no reporter mapped for section={story.section} "
                f"category={story.category}; skipping reporter stage"
            )
            return story

        max_roles = max(1, settings.reporter_parallel_limit)
        roles = roles[:max_roles]

        if len(roles) == 1:
            role = roles[0]
            reporter = self.reporters.get(role)
            if reporter is None:
                logger.warning(f"[pipeline] reporter missing for role={role.value}")
                return story
            logger.info(
                f"[pipeline] reporter mode={settings.reporter_execution_mode}; assigned={role.value}"
            )
            return await reporter.run(story)

        logger.info(
            f"[pipeline] reporter mode={settings.reporter_execution_mode}; "
            f"running {len(roles)} desks in parallel"
        )

        role_task_pairs = []
        for role in roles:
            reporter = self.reporters.get(role)
            if reporter is None:
                logger.warning(f"[pipeline] reporter missing for role={role.value}")
                continue
            role_task_pairs.append((role, reporter.run(story.copy(deep=True))))

        if not role_task_pairs:
            return story

        results = await asyncio.gather(
            *(task for _, task in role_task_pairs),
            return_exceptions=True,
        )

        owner_role = assigned_reporter(story)
        owner_summary = None
        briefs = []

        for (role, _), result in zip(role_task_pairs, results):
            if isinstance(result, Exception):
                logger.error(f"Reporter {role.value} failed: {result}")
                continue
            if not isinstance(result, Story):
                continue

            if result.summary:
                if role == owner_role:
                    owner_summary = result.summary
                briefs.append(
                    {
                        "reporter": role.value,
                        "summary": result.summary,
                        "tags": result.tags[:8],
                    }
                )

            story = self._merge_stories(story, result)

        if owner_summary:
            story.summary = owner_summary

        if story.primary_source is not None:
            story.primary_source.metadata["reporter_briefs"] = briefs

        return story

    async def _run_editorial(self, story: Story) -> Story:
        """Run all editorial agents in parallel."""
        tasks = [agent.run(story.copy(deep=True)) for agent in self.editorial_agents.values()]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, Story):
                story = self._merge_stories(story, result)
            elif isinstance(result, Exception):
                logger.error(f"Editorial agent failed: {result}")

        return story

    async def _run_oversight(self, story: Story) -> Story:
        """Run oversight agents (except EIC) in parallel."""
        tasks = []
        for role, agent in self.oversight_agents.items():
            if role == AgentRole.EDITOR_IN_CHIEF:
                continue
            tasks.append(agent.run(story.copy(deep=True)))

        results = await asyncio.gather(*tasks, return_exceptions=True)
        for result in results:
            if isinstance(result, Story):
                story = self._merge_stories(story, result)
            elif isinstance(result, Exception):
                logger.error(f"Oversight agent failed: {result}")
        return story

    def _merge_stories(self, original: Story, updated: Story) -> Story:
        """Merge one agent's output back onto the shared story."""
        existing_roles = {action.agent_role for action in original.agent_actions}
        for action in updated.agent_actions:
            if action.agent_role not in existing_roles:
                original.agent_actions.append(action)
                existing_roles.add(action.agent_role)

        for role in updated.agents_involved:
            if role not in original.agents_involved:
                original.agents_involved.append(role)

        if updated.summary and not original.summary:
            original.summary = updated.summary
        if updated.tl_dr and not original.tl_dr:
            original.tl_dr = updated.tl_dr
        if updated.content and not original.content:
            original.content = updated.content
        if updated.headline and not original.headline:
            original.headline = updated.headline

        original.tags = list(set(original.tags + updated.tags))

        if updated.category and not original.category:
            original.category = updated.category

        if updated.confidence and not original.confidence:
            original.confidence = updated.confidence
        if updated.scores and not original.scores:
            original.scores = updated.scores
        if updated.risk and not original.risk:
            original.risk = updated.risk

        if updated.suggested_headlines:
            original.suggested_headlines = list(
                set(original.suggested_headlines + updated.suggested_headlines)
            )

        original.sources_analyzed = max(original.sources_analyzed, updated.sources_analyzed)
        original.fact_check_status = updated.fact_check_status or original.fact_check_status
        original.updated_at = datetime.utcnow()
        return original
