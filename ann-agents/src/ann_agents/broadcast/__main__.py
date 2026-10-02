"""Run the broadcast director.

    python -m ann_agents.broadcast            # keep the timeline filled, forever
    python -m ann_agents.broadcast --once     # one tick, then exit
    python -m ann_agents.broadcast --watch    # also check in as a viewer (local testing)
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timedelta, timezone

from loguru import logger

from ann_agents.broadcast.director import Director
from ann_agents.broadcast.lineup import load_lineup
from ann_agents.broadcast.store import BroadcastStore, make_engine
from ann_agents.broadcast.tts import make_voice
from ann_agents.broadcast.writer import ClaudeNewsroom, LocalNewsroom
from ann_agents.core.config import settings
from ann_agents.llm.local import local_pool

TICK_SECONDS = 5
PRUNE_AFTER = timedelta(days=7)


def build_newsroom():
    """Claude, self-hosted models, or nothing, per BROADCAST_LLM."""
    choice = settings.broadcast_llm.lower()
    if choice == "auto":
        choice = "claude" if settings.anthropic_api_key else "local" if local_pool() else "none"

    if choice == "claude":
        if not settings.anthropic_api_key:
            raise SystemExit("BROADCAST_LLM=claude needs ANTHROPIC_API_KEY")
        from anthropic import AsyncAnthropic

        return ClaudeNewsroom(
            AsyncAnthropic(api_key=settings.anthropic_api_key),
            writer_model=settings.broadcast_writer_model,
            feature_model=settings.broadcast_feature_model,
            standards_model=settings.broadcast_standards_model,
        )
    if choice == "local":
        pool = local_pool()
        if pool is None:
            raise SystemExit("BROADCAST_LLM=local needs LOCAL_LLM_BASE_URLS")
        writer = settings.broadcast_local_writer_model or settings.local_llm_model
        standards = settings.broadcast_local_standards_model or settings.local_llm_premium_model or writer
        logger.info(f"[broadcast] writing on {writer} across {len(pool.urls)} server(s)")
        return LocalNewsroom(pool, writer_model=writer, standards_model=standards)

    logger.warning("[broadcast] no model configured; airing headline reads only")
    return None


def build_director() -> Director:
    newsroom = build_newsroom()

    return Director(
        store=BroadcastStore(make_engine()),
        lineup=load_lineup(),
        newsroom=newsroom,
        voice=make_voice(
            settings.broadcast_tts,
            settings.broadcast_piper_bin,
            settings.broadcast_piper_voices_dir,
            settings.broadcast_audio_dir,
        ),
        daily_budget_usd=settings.broadcast_daily_budget_usd,
        viewer_window_seconds=settings.broadcast_viewer_window_seconds,
        lookahead_seconds=settings.broadcast_lookahead_seconds,
        cooldown_hours=settings.broadcast_story_cooldown_hours,
        desk_review=settings.broadcast_llm_standards,
        write_timeout_seconds=settings.broadcast_write_timeout_seconds,
        min_runway_seconds=settings.broadcast_min_runway_seconds,
    )


async def writer_loop(director: Director, watch: bool, once: bool) -> None:
    while True:
        now = datetime.now(timezone.utc)
        if watch:
            director.store.check_in("director-watch", "web", now)
        try:
            result = await director.tick(now)
            if result.action != "booked":
                logger.debug(f"[broadcast] {result.action}: {result.note}")
        except Exception as e:
            logger.exception(f"[broadcast] tick failed: {e}")
            result = None
        if once:
            return
        # Book back to back while the queue is short, then settle into the tick.
        if result is None or result.action != "booked":
            await asyncio.sleep(TICK_SECONDS)


async def prune_loop(director: Director) -> None:
    while True:
        director.store.prune(datetime.now(timezone.utc) - PRUNE_AFTER)
        await asyncio.sleep(3600)


async def run(once: bool, watch: bool) -> None:
    director = build_director()
    if once:
        await writer_loop(director, watch, once=True)
        return
    # One loop per writer, so several model servers write at the same time.
    writers = max(1, settings.broadcast_writers)
    loops = [writer_loop(director, watch, once=False) for _ in range(writers)]
    await asyncio.gather(prune_loop(director), *loops)


def main() -> None:
    parser = argparse.ArgumentParser(description="ANN live broadcast director")
    parser.add_argument("--once", action="store_true", help="run one tick and exit")
    parser.add_argument("--watch", action="store_true", help="check in as a viewer each tick")
    args = parser.parse_args()

    logger.remove()
    logger.add(sys.stderr, format="<green>{time:HH:mm:ss}</green> | <level>{level:8}</level> | {message}", level="INFO")
    asyncio.run(run(args.once, args.watch))


if __name__ == "__main__":
    main()
