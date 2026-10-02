"""Postgres access for the broadcast (tables defined in ann-web/prisma/schema.prisma)."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Sequence

from sqlalchemy import text
from sqlalchemy.engine import Engine

from ann_agents.broadcast.budget import Spend
from ann_agents.broadcast.models import DroppedLine, Segment, StoryInput
from ann_agents.core.db import make_engine

ON_AIR_STATUSES = ("approved", "published")

__all__ = ["BroadcastStore", "make_engine"]


def _utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


class BroadcastStore:
    def __init__(self, engine: Engine):
        self.engine = engine

    def active_viewers(self, now: datetime, window_seconds: int) -> int:
        with self.engine.connect() as conn:
            return conn.execute(
                text('SELECT count(*) FROM "LiveViewer" WHERE "lastSeenAt" > :since'),
                {"since": now - timedelta(seconds=window_seconds)},
            ).scalar_one()

    def check_in(self, viewer_id: str, kind: str, now: datetime) -> None:
        with self.engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO "LiveViewer" (id, kind, "lastSeenAt") VALUES (:id, :kind, :now)
                    ON CONFLICT (id) DO UPDATE SET "lastSeenAt" = :now
                """),
                {"id": viewer_id, "kind": kind, "now": now},
            )

    def queue_end(self) -> Optional[datetime]:
        with self.engine.connect() as conn:
            value = conn.execute(text('SELECT max("endsAt") FROM "BroadcastSegment"')).scalar_one()
        return _utc(value) if value else None

    def last_line(self) -> Optional[str]:
        with self.engine.connect() as conn:
            script = conn.execute(
                text('SELECT script FROM "BroadcastSegment" ORDER BY "startsAt" DESC LIMIT 1')
            ).scalar_one_or_none()
        if not script or not script.get("lines"):
            return None
        return script["lines"][-1]["text"]

    def ident_aired_since(self, since: datetime) -> bool:
        with self.engine.connect() as conn:
            return conn.execute(
                text("""SELECT EXISTS (SELECT 1 FROM "BroadcastSegment" WHERE kind = 'ident' AND "startsAt" >= :since)"""),
                {"since": since},
            ).scalar_one()

    def candidate_stories(
        self, categories: Sequence[str], aired_since: datetime, limit: int = 5
    ) -> List[StoryInput]:
        """Approved stories not aired since `aired_since`, freshest and strongest first."""
        category_filter = 'AND a.category::text = ANY(:categories)' if categories else ""
        sql = f"""
            SELECT a.id, a.title, a.source, a.url, a.category::text, a.summary, a."tlDr",
                   a."publishedAt", COALESCE(s."overallScore", 0)
            FROM "Article" a
            LEFT JOIN "Scores" s ON s."articleId" = a.id
            WHERE a."storyStatus"::text = ANY(:statuses)
              {category_filter}
              AND NOT EXISTS (
                  SELECT 1 FROM "BroadcastSegment" b
                  WHERE b.kind IN ('story', 'reel') AND a.id = ANY(b."articleIds") AND b."startsAt" > :since
              )
            ORDER BY (a."publishedAt" > :fresh) DESC, COALESCE(s."overallScore", 0) DESC, a."publishedAt" DESC
            LIMIT :limit
        """
        params = {
            "statuses": list(ON_AIR_STATUSES),
            "categories": list(categories),
            "since": aired_since,
            "fresh": aired_since - timedelta(hours=42),
            "limit": limit,
        }
        with self.engine.connect() as conn:
            rows = conn.execute(text(sql), params).fetchall()
        return [
            StoryInput(
                id=r[0], title=r[1], source=r[2], url=r[3], category=r[4], summary=r[5] or "",
                tl_dr=r[6], published_at=_utc(r[7]), overall_score=r[8],
            )
            for r in rows
        ]

    def least_recently_aired(self, categories: Sequence[str]) -> Optional[StoryInput]:
        """When every story has aired inside the cooldown, rerun the oldest airing."""
        far_future = datetime.now(timezone.utc) + timedelta(days=3650)
        stories = self.candidate_stories(categories, aired_since=far_future, limit=50)
        if not stories:
            return None
        with self.engine.connect() as conn:
            rows = conn.execute(
                text("""
                    SELECT unnest("articleIds") AS id, max("startsAt") FROM "BroadcastSegment"
                    GROUP BY 1
                """)
            ).fetchall()
        last_aired = {r[0]: _utc(r[1]) for r in rows}
        epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)
        return min(stories, key=lambda s: last_aired.get(s.id, epoch))

    def insert_segment(
        self, segment: Segment, writer: str, cost_usd: float, dropped: Sequence[DroppedLine]
    ) -> None:
        script = {
            "articles": [a.model_dump(by_alias=True) for a in segment.articles],
            "lines": [line.model_dump(by_alias=True) for line in segment.lines],
            "dropped": [d.model_dump() for d in dropped],
        }
        with self.engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO "BroadcastSegment" (
                        id, "showId", kind, "startsAt", "endsAt", "durationMs", title, anchors,
                        "articleIds", script, writer, "costUsd", "createdAt"
                    ) VALUES (
                        :id, :show_id, :kind, :starts_at, :ends_at, :duration_ms, :title, :anchors,
                        :article_ids, CAST(:script AS jsonb), :writer, :cost, now()
                    )
                """),
                {
                    "id": segment.id,
                    "show_id": segment.show_id,
                    "kind": segment.kind,
                    "starts_at": segment.starts_at,
                    "ends_at": segment.starts_at + timedelta(milliseconds=segment.duration_ms),
                    "duration_ms": segment.duration_ms,
                    "title": segment.title,
                    "anchors": list(segment.anchors),
                    "article_ids": [a.id for a in segment.articles],
                    "script": json.dumps(script),
                    "writer": writer,
                    "cost": cost_usd,
                },
            )

    def spent_on(self, day: str) -> float:
        with self.engine.connect() as conn:
            value = conn.execute(
                text('SELECT usd FROM "BroadcastSpend" WHERE day = :day'), {"day": day}
            ).scalar_one_or_none()
        return float(value or 0.0)

    def record_spend(self, day: str, spend: Spend) -> None:
        if spend.calls == 0:
            return
        with self.engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO "BroadcastSpend" (day, usd, "inputTokens", "outputTokens", calls, "updatedAt")
                    VALUES (:day, :usd, :input, :output, :calls, now())
                    ON CONFLICT (day) DO UPDATE SET
                        usd = "BroadcastSpend".usd + :usd,
                        "inputTokens" = "BroadcastSpend"."inputTokens" + :input,
                        "outputTokens" = "BroadcastSpend"."outputTokens" + :output,
                        calls = "BroadcastSpend".calls + :calls,
                        "updatedAt" = now()
                """),
                {
                    "day": day, "usd": spend.usd, "input": spend.input_tokens,
                    "output": spend.output_tokens, "calls": spend.calls,
                },
            )

    def prune(self, before: datetime) -> int:
        with self.engine.begin() as conn:
            gone = conn.execute(
                text('DELETE FROM "BroadcastSegment" WHERE "endsAt" < :before'), {"before": before}
            ).rowcount
            conn.execute(text('DELETE FROM "LiveViewer" WHERE "lastSeenAt" < :before'), {"before": before})
        return gone
