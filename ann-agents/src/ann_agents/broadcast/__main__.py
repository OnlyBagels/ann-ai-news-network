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
from ann_agents.broadcast.writer import ClaudeNewsroom, LocalNewsroom, SplitNewsroom
from ann_agents.core.config import settings
from ann_agents.datadesk.boards import DataDesk
from ann_agents.llm.local import local_pool
from ann_agents.llm.watersheep import watersheep

TICK_SECONDS = 5
PRUNE_AFTER = timedelta(days=7)


def _claude() -> ClaudeNewsroom:
    if not settings.anthropic_api_key:
        raise SystemExit("Claude was chosen for the broadcast but ANTHROPIC_API_KEY is not set")
    from anthropic import AsyncAnthropic

    return ClaudeNewsroom(
        AsyncAnthropic(api_key=settings.anthropic_api_key),
        writer_model=settings.broadcast_writer_model,
        feature_model=settings.broadcast_feature_model,
        standards_model=settings.broadcast_standards_model,
    )


def _local() -> LocalNewsroom:
    pool = local_pool()
    if pool is None:
        raise SystemExit("Local models were chosen for the broadcast but LOCAL_LLM_BASE_URLS is not set")
    writer = settings.broadcast_local_writer_model or settings.local_llm_model
    standards = settings.broadcast_local_standards_model or settings.local_llm_premium_model or writer
    logger.info(f"[broadcast] local models: {writer} writes, {standards} checks, across {len(pool.urls)} server(s)")
    return LocalNewsroom(pool, writer_model=writer, standards_model=standards)


def build_newsroom():
    """Claude, self-hosted models, or nothing, per BROADCAST_LLM and BROADCAST_DESK_LLM."""
    choice = settings.broadcast_llm.lower()
    if choice == "auto":
        choice = "claude" if settings.anthropic_api_key else "local" if local_pool() else "none"
    if choice == "none":
        logger.warning("[broadcast] no model configured; airing headline reads only")
        return None

    writer = _claude() if choice == "claude" else _local()
    desk_choice = settings.broadcast_desk_llm.lower()
    if desk_choice in ("same", choice):
        return writer
    desk = _claude() if desk_choice == "claude" else _local()
    logger.info(f"[broadcast] {choice} writes, {desk_choice} runs the standards desk")
    return SplitNewsroom(writer, desk)


def _watersheep():
    ws = watersheep()
    if ws is None:
        logger.info("[broadcast] WaterSheep not found in WATERSHEEP_DIR; lines get the rules and the desk only")
    else:
        logger.info(f"[broadcast] WaterSheep ({ws.name}) checks every line that states a fact")
    return ws


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
        always_on=settings.broadcast_always_on,
        data_desk=DataDesk() if settings.broadcast_data_desk else None,
        bits=settings.broadcast_bits,
        watersheep=_watersheep(),
        min_support=settings.watersheep_min_support,
    )


async def writer_loop(director: Director, watch: bool, once: bool) -> None:
    while True:
        now = datetime.now(timezone.utc)
        if watch:
            director.store.check_in("director-watch", "web", now)
        try:
            result = await director.tick()
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


async def question_loop(director: Director) -> None:
    """Work viewers' questions through the desk every minute."""
    from ann_agents.desk.questions import QuestionDesk

    desk = QuestionDesk(director.store.engine)
    while True:
        try:
            await desk.process()
        except Exception as e:
            logger.error(f"[questions] round failed: {e}")
        await asyncio.sleep(60)


async def run(once: bool, watch: bool) -> None:
    director = build_director()
    if once:
        await writer_loop(director, watch, once=True)
        return
    # One loop per writer, so several model servers write at the same time.
    writers = max(1, settings.broadcast_writers)
    loops = [writer_loop(director, watch, once=False) for _ in range(writers)]
    await asyncio.gather(prune_loop(director), question_loop(director), *loops)


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
