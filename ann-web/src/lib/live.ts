import { prisma } from "@/lib/prisma";
import lineupJson from "@/broadcast/lineup.json";
import { easternInstant } from "@/broadcast/time";
import type { Board, LiveNow, Lineup, ScriptLine, Segment, SegmentArticle, SegmentKind, StudioSet } from "@/broadcast/types";

export const lineup = lineupJson as Lineup;

// How far back to include segments: the one on air may have started a
// while ago, and a client with a slow clock may still be inside it.
const LOOKBACK_MS = 60_000;
const MAX_SEGMENTS = 12;

interface StoredScript {
  articles?: SegmentArticle[];
  lines?: ScriptLine[];
  set?: StudioSet;
  board?: Board;
}

export async function getLiveNow(now = new Date()): Promise<LiveNow> {
  const rows = await prisma.broadcastSegment.findMany({
    where: { endsAt: { gt: new Date(now.getTime() - LOOKBACK_MS) } },
    orderBy: { startsAt: "asc" },
    take: MAX_SEGMENTS,
  });

  const segments: Segment[] = rows.map((row) => {
    const script = (row.script ?? {}) as StoredScript;
    return {
      id: row.id,
      showId: row.showId,
      kind: row.kind as SegmentKind,
      startsAt: row.startsAt.toISOString(),
      durationMs: row.durationMs,
      title: row.title,
      anchors: row.anchors,
      articles: script.articles ?? [],
      // Lines cut by standards stay in the database for review; they never leave it.
      lines: (script.lines ?? []).map((line) => ({
        speaker: line.speaker,
        text: line.text,
        startMs: line.startMs,
        durationMs: line.durationMs,
        audio: line.audio ?? null,
        mouth: line.mouth ?? null,
        mood: line.mood ?? null,
      })),
      set: script.set,
      board: script.board ?? null,
    };
  });

  return { serverTime: now.toISOString(), segments };
}

const VIEWER_ID = /^[a-z0-9-]{8,64}$/;

export async function checkIn(id: string, kind: "web" | "streamer" = "web"): Promise<boolean> {
  if (!VIEWER_ID.test(id)) return false;
  const now = new Date();
  await prisma.liveViewer.upsert({
    where: { id },
    create: { id, kind, lastSeenAt: now },
    update: { lastSeenAt: now },
  });
  return true;
}

/** The grid as concrete time ranges for one Eastern day, for the schedule table. */
export function gridForDay(day: Date): { show: Lineup["shows"][number]; start: Date; end: Date }[] {
  return lineup.grid.map((slot, i) => {
    const next = lineup.grid[i + 1];
    return {
      show: lineup.shows.find((s) => s.id === slot.show)!,
      start: new Date(easternInstant(day.getTime(), slot.hourEt)),
      end: new Date(next ? easternInstant(day.getTime(), next.hourEt) : easternInstant(day.getTime(), 0, 1)),
    };
  });
}
