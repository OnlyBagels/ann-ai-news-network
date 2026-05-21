"""Story Pipeline - Orchestrates the full agent workflow for each story."""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import List, Optional

from loguru import logger

from ann_agents.bridge.publisher import publisher
from ann_agents.core.types import AgentRole, Story, StoryStatus
from ann_agents.reporters.model_reporter import ModelReporter
from ann_agents.reporters.open_source_reporter import OpenSourceReporter
from ann_agents.reporters.research_reporter import ResearchReporter
from ann_agents.reporters.security_reporter import SecurityReporter
from ann_agents.reporters.regulation_reporter import RegulationReporter
from ann_agents.reporters.business_reporter import BusinessReporter
from ann_agents.research.research_agent import ResearchAgent
from ann_agents.factcheck.fact_check_agent import FactCheckAgent
from ann_agents.editorial.article_writer import ArticleWriter
from ann_agents.editorial.editorial_agents import (
    HeadlineEditor,
    TechnicalEditor,
    StyleEditor,
    SummaryEditor,
)
from ann_agents.editorial.triage_editor import TriageEditor, assigned_reporter
from ann_agents.research.journalist_research import JournalistResearcher
from ann_agents.oversight.oversight_agents import (
    RiskAgent,
    LegalAgent,
    BiasAgent,
    EditorInChief,
)


class StoryPipeline:
    """Orchestrates the full agent workflow for stories.

    Pipeline flow:
    Source detection → Story clustering → Reporter agents investigate
    → Research agents enrich → Fact-check agents verify
    → Editorial agents refine → Risk/legal oversight
    → Editor-in-chief review → Human approval (optional) → Publish
    """

    def __init__(self):
        # Triage editor — reads incoming wire, assigns to one beat.
        self.triage_editor = TriageEditor()

        # JournalistResearcher — 3 parallel researchers, one tool each,
        # combined into a dossier for ArticleWriter.
        self.journalist_researcher = JournalistResearcher()

        # Reporter Agents (6) — only ONE runs per story, picked by triage.
        self.reporters = {
            AgentRole.MODEL_REPORTER: ModelReporter(),
            AgentRole.OPEN_SOURCE_REPORTER: OpenSourceReporter(),
            AgentRole.RESEARCH_REPORTER: ResearchReporter(),
            AgentRole.SECURITY_REPORTER: SecurityReporter(),
            AgentRole.REGULATION_REPORTER: RegulationReporter(),
            AgentRole.BUSINESS_REPORTER: BusinessReporter(),
        }

        # Research Agent
        self.research_agent = ResearchAgent()

        # Fact-Check Agent
        self.fact_check_agent = FactCheckAgent()

        # Editorial Agents (4 parallel + 1 sequential writer)
        self.editorial_agents = {
            AgentRole.HEADLINE_EDITOR: HeadlineEditor(),
            AgentRole.TECHNICAL_EDITOR: TechnicalEditor(),
            AgentRole.STYLE_EDITOR: StyleEditor(),
            AgentRole.SUMMARY_EDITOR: SummaryEditor(),
        }
        # Sequential — runs AFTER the parallel batch because it leans on
        # tl_dr + summary + headline as anchors.
        self.article_writer = ArticleWriter()

        # Oversight Agents (4)
        self.oversight_agents = {
            AgentRole.RISK_AGENT: RiskAgent(),
            AgentRole.LEGAL_AGENT: LegalAgent(),
            AgentRole.BIAS_AGENT: BiasAgent(),
            AgentRole.EDITOR_IN_CHIEF: EditorInChief(),
        }

    async def run_full_pipeline(self, story: Story) -> Story:
        """Run the complete agent pipeline on a story.

        This is the main entry point for processing a story through the newsroom.
        """
        logger.info(f"=== Starting pipeline for story: {story.title[:60]} ===")
        story.status = StoryStatus.INVESTIGATING

        # Step 0: TriageEditor picks the beat. Sets story.category so the
        # assignment step has something to route on.
        story = await self.triage_editor.run(story)

        # Step 1: ONE beat reporter (picked by triage) investigates.
        story = await self._run_assigned_reporter(story)
        story.status = StoryStatus.ENRICHED

        # Step 1b: 3-researcher journalist pass — web search, cross-refs,
        # entity lookups in parallel. Dossier lands on primary_source
        # metadata and ArticleWriter reads it.
        # In assignment-mode the story arrives with no primary_source; log
        # it so operators know we're running research-first, but proceed —
        # the JournalistResearcher and ResearchAgent don't require source body.
        if story.primary_source is None:
            logger.info(
                f"[pipeline] no primary_source for '{story.title[:60]}' "
                "— running in research-first (assignment) mode"
            )
        story = await self.journalist_researcher.run(story)

        # Step 2: Research Agent enriches
        story = await self.research_agent.run(story)

        # Step 3: Fact-Check Agent verifies
        story = await self.fact_check_agent.run(story)
        story.status = StoryStatus.VERIFIED

        # Step 4: Editorial Agents refine (run in parallel)
        story = await self._run_editorial(story)

        # Step 4b: ArticleWriter drafts the body using the just-finalized
        # tl_dr and summary. Sequential — depends on step 4 outputs.
        story = await self.article_writer.run(story)
        story.status = StoryStatus.EDITED

        # Step 5: Oversight Agents review (run in parallel)
        story = await self._run_oversight(story)
        story.status = StoryStatus.REVIEWED

        # Step 6: Editor-in-Chief makes final decision
        story = await self.oversight_agents[AgentRole.EDITOR_IN_CHIEF].run(story)

        # Step 7: Publish to ann-web's admin review queue.
        # Best-effort: a publisher failure does not fail the pipeline.
        # The Story stays in memory and the failure shows up in logs.
        try:
            await publisher.publish(story)
        except Exception as e:
            logger.error(f"[pipeline] publisher raised: {e}")

        logger.info(
            f"=== Pipeline complete for: {story.title[:60]} === "
            f"Status: {story.status.value}, "
            f"Agents: {len(story.agents_involved)}, "
            f"Confidence: {story.confidence.overall_confidence if story.confidence else 'N/A'}"
        )

        return story

    async def _run_assigned_reporter(self, story: Story) -> Story:
        """Run only the reporter the TriageEditor assigned this story to.

        The old behaviour was to fan out to all 6 reporters in parallel and
        merge — wasteful and noisy. A real newsroom assigns a story to one
        beat. The triage editor picked the beat in step 0; we run that
        reporter and that reporter only.
        """
        role = assigned_reporter(story)
        if role is None or role not in self.reporters:
            logger.warning(f"[pipeline] no reporter for story.category={story.category}; skipping investigate")
            return story

        reporter = self.reporters[role]
        logger.info(f"[pipeline] assigned to {role.value}")
        return await reporter.run(story)

    async def _run_editorial(self, story: Story) -> Story:
        """Run all editorial agents in parallel."""
        tasks = []
        for role, agent in self.editorial_agents.items():
            tasks.append(agent.run(story.copy(deep=True)))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, Story):
                story = self._merge_stories(story, result)
            elif isinstance(result, Exception):
                logger.error(f"Editorial agent failed: {result}")

        return story

    async def _run_oversight(self, story: Story) -> Story:
        """Run oversight agents (except Editor-in-Chief) in parallel."""
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
        """Merge updates from an agent's output back into the main story."""
        # Merge agent actions
        existing_roles = {a.agent_role for a in original.agent_actions}
        for action in updated.agent_actions:
            if action.agent_role not in existing_roles:
                original.agent_actions.append(action)
                existing_roles.add(action.agent_role)

        # Merge agents involved
        for role in updated.agents_involved:
            if role not in original.agents_involved:
                original.agents_involved.append(role)

        # Merge content (take first non-None value)
        if updated.summary and not original.summary:
            original.summary = updated.summary
        if updated.tl_dr and not original.tl_dr:
            original.tl_dr = updated.tl_dr
        if updated.content and not original.content:
            original.content = updated.content
        if updated.headline and not original.headline:
            original.headline = updated.headline

        # Merge tags
        original.tags = list(set(original.tags + updated.tags))

        # Merge category (take first set)
        if updated.category and not original.category:
            original.category = updated.category

        # Merge scores
        if updated.confidence and not original.confidence:
            original.confidence = updated.confidence
        if updated.scores and not original.scores:
            original.scores = updated.scores
        if updated.risk and not original.risk:
            original.risk = updated.risk

        # Merge metadata
        if updated.suggested_headlines:
            original.suggested_headlines = list(
                set(original.suggested_headlines + updated.suggested_headlines)
            )

        original.sources_analyzed = max(original.sources_analyzed, updated.sources_analyzed)
        original.fact_check_status = updated.fact_check_status or original.fact_check_status
        original.updated_at = datetime.utcnow()

        return original
