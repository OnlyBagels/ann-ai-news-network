// One frame of the ANN broadcast at 640x360, drawn with fillStyle + fillRect
// only. The web player and the Node streamer both call drawFrame, so the
// output is identical in both.
//
// The set comes from the segment (or its show): see studio.ts. The cast are
// the 2x characters from character.ts; face.ts decides their faces and
// gesture.ts their hands and props.

import type { Anchor, Lineup, ScriptLine, Segment, Show, StudioSet } from "./types";
import { MOUTH_FPS } from "./types";
import { easternHour, easternHourLabel } from "./time";
import { type PixelCtx, drawText, drawTextScaled, measure, normalizeText, truncate, wrap } from "./font";
import { breathOffset, drawEmote } from "./sprites";
import { act, letterAt, type Acting } from "./face";
import { gesture, type Hands } from "./gesture";
import {
  CHAR_DESK_ROW,
  CHAR_H,
  CHAR_W,
  drawArm,
  drawBust,
  drawDeskMic,
  drawHeldSheet,
  drawLegs,
  drawMug,
  drawNotes,
} from "./character";
import { H, TICKER_Y, W, drawBackdrop, drawDeskFronts, drawDeskTops, layoutFor, type Layout, type Seat } from "./studio";

export type { PixelCtx } from "./font";

export const WIDTH = W;
export const HEIGHT = H;

/** The on-air clock: the channel runs on US Eastern time. */
export function easternClock(ms: number): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(ms)) + " ET";
}

export interface FrameInput {
  lineup: Lineup;
  nowMs: number; // wall-clock ms (Date.now()) used for idle animation + clock + ticker
  segment: Segment | null; // segment on air, or null = standby
  segmentElapsedMs: number; // ms since segment.startsAt
  upcoming: Segment[]; // queued segments, for the ticker
  clockLabel: string; // e.g. "2:41 PM ET"; the caller formats it
  captions: boolean; // draw the speech bubble
}

const INK = "#0d0f13";
const PAPER = "#f2efe8";
const MUTED = "#a3a8b1";
const RED = "#d7263d";
const GOLD = "#e3b341";
const NAVY = "#12244a";

// ---------------------------------------------------------------------------
// Script timing

export interface CurrentLine {
  line: ScriptLine;
  index: number;
  /** ms since the line started; may exceed line.durationMs in the gap before the next line. */
  lineElapsedMs: number;
}

/**
 * The most recent line that has started at elapsedMs (lines are taken in
 * startMs order). Returns null before the first line. During a gap between
 * lines the previous line is returned with lineElapsedMs past its duration.
 */
export function currentLine(segment: Segment | null, elapsedMs: number): CurrentLine | null {
  if (!segment || segment.lines.length === 0) return null;
  let best: CurrentLine | null = null;
  segment.lines.forEach((line, index) => {
    if (line.startMs <= elapsedMs && (!best || line.startMs >= best.line.startMs)) {
      best = { line, index, lineElapsedMs: elapsedMs - line.startMs };
    }
  });
  return best;
}

const VOWELS = new Set("aeiouy");
const FRAME_MS = 1000 / MOUTH_FPS;

/**
 * Mouth openness 0..1 for the speaker of `line` at lineElapsedMs. Uses the
 * line's mouth envelope when present; otherwise walks the text at a rate
 * that fills the line's duration (vowels open, other letters half, spaces
 * and punctuation closed). Always 0 outside the line.
 */
export function mouthOpenness(line: ScriptLine, lineElapsedMs: number): number {
  if (!(lineElapsedMs >= 0) || lineElapsedMs >= line.durationMs) return 0;
  const frame = Math.floor(lineElapsedMs / FRAME_MS);
  if (line.mouth && line.mouth.length > 0) {
    const v = line.mouth[Math.min(frame, line.mouth.length - 1)];
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
  }
  const text = normalizeText(line.text).toLowerCase();
  if (text.length === 0) return 0;
  const t = (frame + 0.5) * FRAME_MS;
  const idx = Math.min(text.length - 1, Math.floor((t / line.durationMs) * text.length));
  const ch = text[idx];
  if (VOWELS.has(ch)) return 1;
  if ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9")) return 0.45;
  return 0;
}

// ---------------------------------------------------------------------------
// Helpers

function rect(ctx: PixelCtx, x: number, y: number, w: number, h: number, color: string): void {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function findShow(lineup: Lineup, id: string | undefined): Show | undefined {
  return id ? lineup.shows.find((s) => s.id === id) : undefined;
}

/** An anchor, or a reporter at the desk as a guest or correspondent. */
function findAnchor(lineup: Lineup, id: string): Anchor | undefined {
  const anchor = lineup.anchors.find((a) => a.id === id);
  if (anchor) return anchor;
  const r = lineup.reporters?.find((x) => x.id === id);
  return r ? { id: r.id, name: r.name, role: r.title, voice: r.voice, look: r.look, persona: r.bio } : undefined;
}

/** Draw 1x pixel art (the emotes) at 2x around an origin. */
function doubled(ctx: PixelCtx, ox: number, oy: number): PixelCtx {
  return {
    set fillStyle(v: unknown) {
      ctx.fillStyle = v;
    },
    get fillStyle() {
      return ctx.fillStyle;
    },
    fillRect(x: number, y: number, w: number, h: number) {
      ctx.fillRect(ox + x * 2, oy + y * 2, w * 2, h * 2);
    },
  };
}

// ---------------------------------------------------------------------------
// Cast

interface Cast {
  seat: Seat;
  anchor: Anchor;
  acting: Acting;
  hands: Hands;
  x: number; // bust top-left
  y: number;
}

function castFor(input: FrameInput, segment: Segment, layout: Layout, cur: CurrentLine | null): Cast[] {
  const anchors = segment.anchors.map((id) => findAnchor(input.lineup, id)).filter((a): a is Anchor => !!a);
  const seats = layout.seats.slice(0, anchors.length);
  const active = cur && cur.lineElapsedMs < cur.line.durationMs ? cur : null;
  const speakerSeat = active ? anchors.findIndex((a) => a.id === active.line.speaker) : -1;
  const previous = cur && cur.index > 0 ? segment.lines[cur.index - 1] : null;
  const previousSeat = previous ? anchors.findIndex((a) => a.id === previous.speaker) : -1;
  const word = cur ? letterAt(cur.line, cur.lineElapsedMs).word : 0;
  return seats.map((seat, i) => {
    const anchor = anchors[i];
    const acting = act({
      anchorId: anchor.id,
      seat: i,
      nowMs: input.nowMs,
      speakerSeat,
      line: cur?.line ?? null,
      lineIndex: cur?.index ?? 0,
      lineElapsedMs: cur?.lineElapsedMs ?? 0,
      previousSeat,
      open: i === speakerSeat && active ? mouthOpenness(active.line, active.lineElapsedMs) : 0,
    });
    const hands = gesture({
      anchorId: anchor.id,
      nowMs: input.nowMs,
      talking: i === speakerSeat,
      someoneTalking: speakerSeat >= 0,
      mood: acting.mood,
      lineElapsedMs: cur?.lineElapsedMs ?? 0,
      lineMs: cur?.line.durationMs ?? 0,
      lineIndex: cur?.index ?? 0,
      word,
      standing: seat.standing,
      boardSide: seat.boardSide,
      segmentLeftMs: segment.durationMs - input.segmentElapsedMs,
    });
    const dy = seat.standing ? 0 : breathOffset(input.nowMs, anchor.id);
    return { seat, anchor, acting, hands, x: seat.cx - CHAR_W / 2, y: seat.top + dy };
  });
}

function drawCast(ctx: PixelCtx, input: FrameInput, layout: Layout, cast: Cast[], show: Show | undefined): void {
  // Bodies, behind the desks.
  for (const c of cast) {
    if (c.seat.standing) drawLegs(ctx, c.anchor.look, c.x, c.y, Math.sin(input.nowMs / 1700 + c.x) > 0.6 ? 1 : 0);
    drawBust(ctx, c.anchor.look, c.acting.pose, c.x, c.y, c.seat.standing ? CHAR_H : CHAR_DESK_ROW + 2, c.acting.head, c.seat.standing);
  }
  drawDeskTops(ctx, layout);
  // Props on the desk, then arms and whatever is in hand.
  for (const c of cast) {
    if (c.seat.standing) continue;
    const deskY = c.y + CHAR_DESK_ROW;
    if (!c.hands.sheet) drawNotes(ctx, c.x + 18, deskY + 2);
    if (layout.set === "latenight" && c === cast[0]) drawDeskMic(ctx, c.x - 14, deskY - 12);
    if (!c.hands.mug.inHand && layout.set !== "latenight" ? true : !c.hands.mug.inHand && c === cast[0]) {
      drawMug(ctx, c.x + c.hands.mug.x, c.y + c.hands.mug.y, c.anchor.look.accent, input.nowMs + c.x * 37, true);
    }
  }
  for (const c of cast) {
    if (c.hands.sheet) drawHeldSheet(ctx, c.x + c.hands.sheet.x, c.y + c.hands.sheet.y, input.nowMs);
    drawArm(ctx, c.anchor.look, c.x, c.y, -1, c.hands.left);
    drawArm(ctx, c.anchor.look, c.x, c.y, 1, c.hands.right);
    if (c.hands.pen) rect(ctx, c.x + c.hands.left.hx - 6, c.y + c.hands.left.hy - 8, 2, 9, "#1c1822");
    if (c.hands.mug.inHand) drawMug(ctx, c.x + c.hands.mug.x, c.y + c.hands.mug.y, c.anchor.look.accent, input.nowMs, false);
  }
  drawDeskFronts(ctx, layout, input.lineup.network, show);
  // Emotes last, so a desk never hides them.
  for (const c of cast) {
    const e = c.acting.emote;
    if (!e) continue;
    drawEmote(doubled(ctx, c.x + c.acting.head.dx * 2, c.y + c.acting.head.dy * 2), e.kind, 0, 0, e.ms, c.acting.pose.turn);
  }
}

// ---------------------------------------------------------------------------
// Overlays

function drawBug(ctx: PixelCtx, network: string, showName: string): void {
  const mark = network.toUpperCase();
  const mw = measure(mark) * 2;
  rect(ctx, 8, 8, mw + 12, 22, RED);
  drawTextScaled(ctx, mark, 14, 12, PAPER, 2);
  rect(ctx, 8 + mw + 12, 8, measure(showName) + 16, 22, INK);
  drawText(ctx, showName, 8 + mw + 20, 15, PAPER);
}

function drawClockBox(ctx: PixelCtx, showName: string, clock: string): void {
  const name = truncate(showName, 150);
  const nameW = measure(name) * 1 + 16;
  const liveW = measure("LIVE") * 2 + 12;
  const clockW = measure(clock) + 16;
  const total = nameW + liveW + clockW;
  const x = W - 8 - total;
  const y = 300;
  rect(ctx, x, y, nameW, 30, NAVY);
  drawText(ctx, name, x + 8, y + 11, GOLD);
  rect(ctx, x + nameW, y, liveW, 30, RED);
  drawTextScaled(ctx, "LIVE", x + nameW + 6, y + 7, PAPER, 2);
  rect(ctx, x + nameW + liveW, y, clockW, 30, PAPER);
  drawText(ctx, clock, x + nameW + liveW + 8, y + 11, INK);
}

/** Name and role of whoever is talking, under a tag with the segment's headline. */
function drawLowerThird(ctx: PixelCtx, tag: string, speaker: Anchor | undefined): void {
  const tagText = truncate(tag.toUpperCase(), 300);
  const tagW = measure(tagText) + 16;
  rect(ctx, 8, 276, tagW, 18, RED);
  drawText(ctx, tagText, 16, 281, PAPER);
  if (!speaker) return;
  const name = speaker.name;
  const role = speaker.role;
  const w = Math.max(measure(name) * 2 + measure(role) + 32, tagW);
  rect(ctx, 8, 294, Math.min(w, 380), 38, NAVY);
  rect(ctx, 8, 294, Math.min(w, 380), 2, GOLD);
  drawTextScaled(ctx, name, 16, 304, PAPER, 2);
  drawText(ctx, truncate(role, 380 - measure(name) * 2 - 32), 24 + measure(name) * 2, 311, GOLD);
}

/** The line being spoken, in a bubble pointing at the speaker. */
function drawBubble(ctx: PixelCtx, line: ScriptLine, c: Cast): void {
  const text = normalizeText(line.text);
  const maxW = 240;
  const lines = wrap(text, maxW).slice(0, 5);
  const w = Math.max(...lines.map((l) => measure(l))) + 20;
  const h = lines.length * 11 + 14;
  const headTop = c.y + c.acting.head.dy - 6;
  let x = Math.round(c.seat.cx - w / 2);
  x = Math.max(8, Math.min(W - 8 - w, x));
  const y = Math.max(36, headTop - h - 10);
  rect(ctx, x - 2, y - 2, w + 4, h + 4, "#3a3328");
  rect(ctx, x, y, w, h, "#f6efd8");
  rect(ctx, x, y + h - 3, w, 3, "#e3d8b8");
  // Tail toward the speaker's head.
  const tx = Math.max(x + 10, Math.min(x + w - 14, c.seat.cx - 4));
  for (let k = 0; k < 6; k++) {
    rect(ctx, tx + k, y + h + k, 8 - k * 2 > 0 ? 8 - k * 2 : 1, 1, k === 5 ? "#3a3328" : "#f6efd8");
    rect(ctx, tx + k - 1, y + h + k, 1, 1, "#3a3328");
  }
  lines.forEach((l, i) => drawText(ctx, l, x + 10, y + 8 + i * 11, "#1c1a16"));
}

const TICKER_SPEED = 40; // px per second


function tickerText(input: FrameInput): string {
  const titles = input.upcoming.map((s) => normalizeText(s.title).trim()).filter(Boolean);
  if (titles.length > 0) return `UP NEXT: ${titles.join("  /  ")}`;
  const grid = [...input.lineup.grid].sort((a, b) => a.hourEt - b.hourEt);
  const hour = easternHour(input.nowMs);
  const next = grid.filter((g) => g.hourEt > hour).concat(grid.filter((g) => g.hourEt <= hour));
  return next
    .map((g) => {
      const s = findShow(input.lineup, g.show);
      return s ? `${easternHourLabel(g.hourEt)} ET ${s.name}` : "";
    })
    .filter(Boolean)
    .join("  /  ");
}

function drawTicker(ctx: PixelCtx, input: FrameInput): void {
  rect(ctx, 0, TICKER_Y, W, H - TICKER_Y, INK);
  rect(ctx, 0, TICKER_Y, W, 2, GOLD);
  const label = input.lineup.network.toUpperCase();
  const labelW = measure(label) * 2 + 16;
  const text = tickerText(input);
  if (text) {
    const loop = `${text}   *   `;
    const loopW = measure(loop) * 2;
    const offset = Math.floor((input.nowMs / 1000) * TICKER_SPEED) % Math.max(1, loopW);
    for (let x = labelW + 6 - offset; x < W; x += loopW) {
      // Clip by drawing only glyph runs right of the label: draw, then cover.
      drawTextScaled(ctx, loop, x, TICKER_Y + 5, PAPER, 2);
    }
  }
  rect(ctx, 0, TICKER_Y, labelW, H - TICKER_Y, RED);
  drawTextScaled(ctx, label, 8, TICKER_Y + 5, PAPER, 2);
}

function drawIdentCard(ctx: PixelCtx, show: Show | undefined, network: string): void {
  const name = (show?.name ?? network).toUpperCase();
  const nw = measure(name) * 4;
  const scale = nw <= 560 ? 4 : 2;
  const w = Math.min(600, measure(name) * scale + 48);
  const x = (W - w) / 2;
  rect(ctx, x, 196, w, 70, NAVY);
  rect(ctx, x, 196, w, 3, GOLD);
  rect(ctx, x, 263, w, 3, GOLD);
  drawTextScaled(ctx, name, Math.round(W / 2 - (measure(name) * scale) / 2), 206, PAPER, scale);
  if (show) {
    const blurb = truncate(show.blurb, w - 24);
    drawText(ctx, blurb, Math.round(W / 2 - measure(blurb) / 2), 248, GOLD);
  }
}

/** The show on the grid right now. */
function showOnGrid(lineup: Lineup, nowMs: number): Show | undefined {
  const hour = easternHour(nowMs);
  const grid = [...lineup.grid].sort((a, b) => a.hourEt - b.hourEt);
  let slot = grid[0];
  for (const g of grid) if (g.hourEt <= hour) slot = g;
  return slot ? findShow(lineup, slot.show) : undefined;
}

/**
 * Nothing queued: the channel stays live. The show's anchors sit at the desk
 * between stories (coffee, notes, a look around) under a "Coming up" tag.
 */
function idleSegment(input: FrameInput): Segment {
  const show = showOnGrid(input.lineup, input.nowMs);
  const anchors = show?.anchors ?? input.lineup.anchors.slice(0, 2).map((a) => a.id);
  return {
    id: "between-stories",
    showId: show?.id ?? "",
    kind: "reel",
    startsAt: new Date(input.nowMs - (input.nowMs % 60_000)).toISOString(),
    durationMs: 120_000,
    title: "",
    anchors,
    articles: [],
    lines: [],
    set: "desk",
  };
}

// ---------------------------------------------------------------------------

export function drawFrame(ctx: PixelCtx, input: FrameInput): void {
  const { lineup, segment } = input;

  if (!segment) {
    const idle = idleSegment(input);
    const show = findShow(lineup, idle.showId);
    const layout = layoutFor("desk", idle.anchors.length);
    drawBackdrop(ctx, layout, { nowMs: input.nowMs, show, network: lineup.network, headline: "", source: "", board: null, showName: show?.name ?? lineup.network });
    drawCast(ctx, input, layout, castFor({ ...input, segmentElapsedMs: input.nowMs % 60_000 }, idle, layout, null), show);
    drawLowerThird(ctx, `Coming up on ${show?.name ?? lineup.network}`, undefined);
    drawBug(ctx, lineup.network, show?.name ?? "Live desk");
    drawClockBox(ctx, show?.name ?? lineup.network, input.clockLabel);
    drawTicker(ctx, input);
    return;
  }

  const show = findShow(lineup, segment.showId);
  const set: StudioSet = segment.set ?? show?.set ?? "desk";
  const layout = layoutFor(set, segment.anchors.length);
  const cur = currentLine(segment, input.segmentElapsedMs);
  const article = segment.articles[0];

  drawBackdrop(ctx, layout, {
    nowMs: input.nowMs,
    show,
    network: lineup.network,
    headline: segment.title,
    source: article?.source ?? "",
    board: segment.board,
    showName: show?.name ?? lineup.network,
  });
  const cast = castFor(input, segment, layout, cur);
  drawCast(ctx, input, layout, cast, show);

  if (segment.kind === "ident") {
    drawIdentCard(ctx, show, lineup.network);
  } else {
    const speakerId = cur?.line.speaker ?? segment.anchors[0];
    const tag = layout.set === "desk" ? (show?.name ?? lineup.network) : segment.title;
    drawLowerThird(ctx, tag, speakerId ? findAnchor(lineup, speakerId) : undefined);
  }
  const active = cur && cur.lineElapsedMs < cur.line.durationMs ? cur : null;
  if (input.captions && active) {
    const speaker = cast.find((c) => c.anchor.id === active.line.speaker);
    if (speaker) drawBubble(ctx, active.line, speaker);
  }

  drawBug(ctx, lineup.network, show?.name ?? "Live desk");
  drawClockBox(ctx, show?.name ?? lineup.network, input.clockLabel);
  drawTicker(ctx, input);
}
