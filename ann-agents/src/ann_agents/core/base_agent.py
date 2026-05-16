"""Base agent class that all ANN agents inherit from."""

from __future__ import annotations

import time
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any, Dict, List, Optional

from loguru import logger

from ann_agents.core.types import (
    AgentAction,
    AgentRole,
    AgentState,
    Story,
)


class BaseAgent(ABC):
    """Abstract base class for all ANN newsroom agents."""

    def __init__(self, role: AgentRole):
        self.role = role
        self.name = self.role.value

    @abstractmethod
    async def process(self, story: Story) -> Story:
        """Process a story and return the updated story with agent output."""
        ...

    async def run(self, story: Story) -> Story:
        """Run the agent on a story with timing and error handling."""
        action = AgentAction(
            agent_role=self.role,
            state=AgentState.WORKING,
            started_at=datetime.utcnow(),
        )

        start_time = time.time()
        try:
            logger.info(f"[{self.name}] Processing story: {story.title[:60]}...")
            story = await self.process(story)

            elapsed_ms = int((time.time() - start_time) * 1000)
            action.state = AgentState.COMPLETED
            action.completed_at = datetime.utcnow()
            action.duration_ms = elapsed_ms
            logger.info(f"[{self.name}] Completed in {elapsed_ms}ms")

        except Exception as e:
            elapsed_ms = int((time.time() - start_time) * 1000)
            action.state = AgentState.FAILED
            action.completed_at = datetime.utcnow()
            action.error = str(e)
            action.duration_ms = elapsed_ms
            logger.error(f"[{self.name}] Failed after {elapsed_ms}ms: {e}")

        # Record the action
        story.agent_actions.append(action)
        if action.state == AgentState.COMPLETED:
            if self.role not in story.agents_involved:
                story.agents_involved.append(self.role)

        story.updated_at = datetime.utcnow()
        return story

    def _build_prompt(self, template: str, **kwargs: Any) -> str:
        """Build a prompt from a template with variables."""
        return template.format(**kwargs)

    def _truncate(self, text: Optional[str], max_chars: int = 8000) -> str:
        """Truncate text to max_chars for LLM context limits."""
        if not text:
            return ""
        return text[:max_chars] + "..." if len(text) > max_chars else text
