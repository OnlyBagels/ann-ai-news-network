"""FastAPI server - HTTP interface for the agent pipeline.

Provides endpoints that the Next.js frontend can call to:
- Trigger ingestion
- Check pipeline health/status
- Get human review queue
- Approve/reject articles
"""

from __future__ import annotations

import asyncio
from contextlib import suppress
from datetime import datetime
from typing import Dict, List, Optional

from fastapi import BackgroundTasks, FastAPI, HTTPException
from loguru import logger
from pydantic import BaseModel, Field, field_validator

from ann_agents.bridge.db_bridge import DatabaseBridge
from ann_agents.bridge.meilisearch_sync import MeilisearchSync
from ann_agents.bridge.scheduler import NewsroomScheduler
from ann_agents.core.config import settings
from ann_agents.core.types import Story, SourceItem, StoryStatus
from ann_agents.pipeline.story_pipeline import StoryPipeline

app = FastAPI(title="ANN Agent Service", version="0.1.0")

# Shared instances
db = DatabaseBridge()
search = MeilisearchSync()
scheduler = NewsroomScheduler()
_pipeline = StoryPipeline()

# Pipeline state
pipeline_state: Dict[str, any] = {
    "status": "idle",
    "last_run": None,
    "stories_processed": 0,
    "is_running": False,
}
_scheduler_task: Optional[asyncio.Task] = None


class IngestRequest(BaseModel):
    source: str = "all"
    limit: int = 10


class ReviewAction(BaseModel):
    article_id: str
    action: str  # "approve" or "reject"
    reviewer: str = "system"
    notes: str = ""


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
        "pipeline": pipeline_state,
        "version": "0.1.0",
    }


@app.post("/api/ingest")
async def trigger_ingest(request: IngestRequest):
    """Trigger a single ingestion + pipeline cycle."""
    if pipeline_state["is_running"]:
        raise HTTPException(status_code=409, detail="Pipeline is already running")

    pipeline_state["is_running"] = True
    pipeline_state["status"] = "running"

    try:
        processed = await scheduler.run_once()
        pipeline_state["last_run"] = datetime.utcnow().isoformat()
        pipeline_state["stories_processed"] += processed
        pipeline_state["status"] = "idle"
        return {
            "success": True,
            "stories_processed": processed,
            "source": request.source,
        }
    except Exception as e:
        pipeline_state["status"] = "error"
        logger.error(f"Ingestion failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        pipeline_state["is_running"] = False


@app.get("/api/review")
async def get_review_queue(limit: int = 20):
    """Get articles needing human review."""
    articles = db.get_human_review_queue(limit=limit)
    return {"articles": articles, "total": len(articles)}


@app.post("/api/review")
async def process_review(action: ReviewAction):
    """Approve or reject an article."""
    if action.action == "approve":
        success = db.approve_article(action.article_id, action.reviewer)
        if success:
            search.index_article(action.article_id)
    elif action.action == "reject":
        success = db.reject_article(action.article_id, action.notes)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {action.action}")

    if not success:
        raise HTTPException(status_code=500, detail="Failed to process review action")

    return {"success": True, "action": action.action}


@app.get("/api/stats")
async def get_stats():
    """Get pipeline statistics."""
    try:
        articles = db.get_human_review_queue(limit=0)
        return {
            "pipeline": pipeline_state,
            "review_queue_size": len(articles),
        }
    except Exception as e:
        logger.error(f"Failed to get stats: {e}")
        return {"pipeline": pipeline_state, "review_queue_size": 0}


_VALID_SECTIONS = {
    "world", "politics", "business", "tech", "science",
    "climate", "health", "sports", "culture", "opinion",
}


class AssignmentRequest(BaseModel):
    topic: str = Field(..., min_length=1, max_length=500)
    section: Optional[str] = None
    region: Optional[str] = None
    country: Optional[str] = None
    category: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("section")
    @classmethod
    def validate_section(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in _VALID_SECTIONS:
            raise ValueError(
                f"invalid section '{v}' — must be one of: "
                + ", ".join(sorted(_VALID_SECTIONS))
            )
        return v


def _build_assignment_story(req: AssignmentRequest) -> Story:
    """Build a synthetic Story for research-first (no-URL) assignment mode.

    The story has no primary_source and no URL so the pipeline runs in
    research-first mode: triage → JournalistResearcher → ResearchAgent
    → fact-check → editorial → oversight → publish.
    """
    story = Story(
        title=req.topic,
        url=None,
        primary_source=None,
    )
    if req.region:
        story.region = req.region
    if req.country:
        story.country = req.country

    # Pre-seed category from the request so TriageEditor has a starting hint.
    if req.category:
        from ann_agents.core.types import parse_category
        parsed = parse_category(req.category)
        if parsed:
            story.category = parsed

    # Stash metadata for downstream agents that may want it.
    # We use a synthetic SourceItem as a metadata carrier so the
    # JournalistResearcher (which reads primary_source.metadata) has
    # somewhere to write the dossier back.
    story.primary_source = SourceItem(
        title=req.topic,
        url=f"ann://internal/{story.id}",
        source_name="assignment",
        source_type="assignment",
        published_at=datetime.utcnow(),
        content=None,
        metadata={
            "assignment": True,
            **({"section": req.section} if req.section else {}),
            **({"region": req.region} if req.region else {}),
            **({"country": req.country} if req.country else {}),
            **({"notes": req.notes} if req.notes else {}),
        },
    )

    return story


async def _run_assignment_pipeline(story: Story) -> None:
    """Background task: run the full pipeline and log the result."""
    try:
        await _pipeline.run_full_pipeline(story)
        logger.info(f"[assignment] pipeline finished for story {story.id}")
    except Exception as exc:
        logger.error(f"[assignment] pipeline failed for story {story.id}: {exc}")


@app.post("/api/assignment")
async def create_assignment(
    req: AssignmentRequest,
    background_tasks: BackgroundTasks,
):
    """Accept a manual topic assignment and run the pipeline in the background.

    Returns immediately once the story is queued. The article lands in the
    admin review queue via the normal publisher → POST /api/agents/draft flow.
    """
    story = _build_assignment_story(req)
    story.status = StoryStatus.RAW

    background_tasks.add_task(_run_assignment_pipeline, story)

    logger.info(
        f"[assignment] queued story {story.id} — topic: '{req.topic[:80]}'"
    )
    return {"assignmentId": story.id, "status": "queued"}


@app.on_event("startup")
async def startup():
    """Initialize on server start."""
    global _scheduler_task
    logger.info("ANN Agent Service starting up...")
    if settings.scheduler_enabled:
        logger.info(
            "Scheduler loop enabled (interval={}m, delay={}s)",
            settings.scheduler_interval_minutes,
            settings.scheduler_startup_delay_seconds,
        )
        _scheduler_task = asyncio.create_task(_run_scheduler_loop())
        return

    # Fallback mode: single startup cycle only.
    asyncio.create_task(_initial_ingest())


@app.on_event("shutdown")
async def shutdown():
    """Stop background scheduler loop cleanly."""
    global _scheduler_task
    scheduler.stop()
    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()
        with suppress(asyncio.CancelledError):
            await _scheduler_task


async def _run_scheduler_loop():
    """Run the scheduler forever and keep pipeline health state updated."""
    delay_seconds = max(0, settings.scheduler_startup_delay_seconds)
    if delay_seconds:
        await asyncio.sleep(delay_seconds)

    interval_minutes = max(1, settings.scheduler_interval_minutes)
    scheduler._running = True
    logger.info(f"Scheduler started, running every {interval_minutes} minutes")

    while scheduler._running:
        pipeline_state["is_running"] = True
        pipeline_state["status"] = "running"
        try:
            processed = await scheduler.run_once()
            pipeline_state["last_run"] = datetime.utcnow().isoformat()
            pipeline_state["stories_processed"] += processed
            pipeline_state["status"] = "idle"
        except Exception as exc:
            pipeline_state["status"] = "error"
            logger.error(f"Scheduled ingestion cycle failed: {exc}")
        finally:
            pipeline_state["is_running"] = False

        logger.info(f"Sleeping for {interval_minutes} minutes...")
        await asyncio.sleep(interval_minutes * 60)


async def _initial_ingest():
    """Run initial ingestion after a short delay."""
    await asyncio.sleep(5)
    logger.info("Running initial ingestion...")
    try:
        processed = await scheduler.run_once()
        pipeline_state["last_run"] = datetime.utcnow().isoformat()
        pipeline_state["stories_processed"] = processed
        logger.info(f"Initial ingestion complete: {processed} stories")
    except Exception as e:
        logger.error(f"Initial ingestion failed: {e}")
