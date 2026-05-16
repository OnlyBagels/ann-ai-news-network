"""FastAPI server - HTTP interface for the agent pipeline.

Provides endpoints that the Next.js frontend can call to:
- Trigger ingestion
- Check pipeline health/status
- Get human review queue
- Approve/reject articles
"""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Dict, List, Optional

from fastapi import FastAPI, HTTPException
from loguru import logger
from pydantic import BaseModel

from ann_agents.bridge.db_bridge import DatabaseBridge
from ann_agents.bridge.meilisearch_sync import MeilisearchSync
from ann_agents.bridge.scheduler import NewsroomScheduler
from ann_agents.core.config import settings

app = FastAPI(title="ANN Agent Service", version="0.1.0")

# Shared instances
db = DatabaseBridge()
search = MeilisearchSync()
scheduler = NewsroomScheduler()

# Pipeline state
pipeline_state: Dict[str, any] = {
    "status": "idle",
    "last_run": None,
    "stories_processed": 0,
    "is_running": False,
}


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


@app.on_event("startup")
async def startup():
    """Initialize on server start."""
    logger.info("ANN Agent Service starting up...")
    # Run initial ingestion in background
    asyncio.create_task(_initial_ingest())


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
