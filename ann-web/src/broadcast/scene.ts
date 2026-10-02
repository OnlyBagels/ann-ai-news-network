// One frame of the ANN broadcast at 320x180, drawn with fillStyle + fillRect
// only. The web player and the Node streamer both call drawFrame, so the
// output is identical in both.

import type { Anchor, Lineup, ScriptLine, Segment, Show } from "./types";
import { MOUTH_FPS } from "./types";
import {
  ADVANCE,
  LINE_HEIGHT,
  type PixelCtx,
  drawText,
  drawTextScaled,
  measure,
  normalizeText,
  truncate,
  wrap,
} from "./font";
import {
  HAND_H,
  SPRITE_DESK_ROW,
  SPRITE_W,
  type Turn,
  breathOffset,
  drawAnchor,
  drawHand,
  isBlinking,
  lightOf,
  mix,
  mouthState,
  shadeOf,
} from "./sprites";

export type { PixelCtx } from "./font";

export const WIDTH = 320;
export const HEIGHT = 180;

export interface FrameInput {
  lineup: Lineup;
  nowMs: number; // wall-clock ms (Date.now()) used for idle animation + clock + ticker
  segment: Segment | null; // segment on air, or null = standby
  segmentElapsedMs: number; // ms since segment.startsAt
  upcoming: Segment[]; // queued segments, for the ticker
  clockLabel: string; // e.g. "14:05 UTC"; the caller formats it
  captions: boolean; // draw caption box
}

// ---------------------------------------------------------------------------
// Palette: show colour for the set, near-black / off-white UI, one accent.

const INK = "#0d0f13"; // near-black UI
const PAPER = "#f2efe8"; // off-white UI
const MUTED = "#a3a8b1"; // secondary text on INK
const ACCENT = "#d7263d"; // LIVE box + lower-third tag only
const NEUTRAL_SHOW = "#2a2d36";

const DESK_TOP = 106;
const TICKER_Y = 169;
const TICKER_H = HEIGHT - TICKER_Y;
const LT_BOTTOM = 166; // lower third ends here (exclusive)
const LT_X = 8;
const LT_W = WIDTH - 16;

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
// Small drawing helpers

function rect(ctx: PixelCtx, x: number, y: number, w: number, h: number, color: string): void {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function textWidth(text: string, scale = 1): number {
  return measure(text) * scale;
}

function findShow(lineup: Lineup, id: string | undefined): Show | undefined {
  return id ? lineup.shows.find((s) => s.id === id) : undefined;
}

function findAnchor(lineup: Lineup, id: string): Anchor | undefined {
  return lineup.anchors.find((a) => a.id === id);
}

interface SetColors {
  wall: string;
  wallPanel: string;
  seam: string;
  seamLight: string;
  wainscot: string;
  rig: string;
  floor: string;
  screen: string;
  screenInk: string;
  motif: string;
  stripe: string;
}

const setCache = new Map<string, SetColors>();

function setColors(showColor: string): SetColors {
  let c = setCache.get(showColor);
  if (!c) {
    c = {
      wall: lightOf(showColor, 0.16),
      wallPanel: lightOf(showColor, 0.24),
      seam: shadeOf(showColor, 0.2),
      seamLight: lightOf(showColor, 0.34),
      wainscot: shadeOf(showColor, 0.12),
      rig: mix(showColor, "#000000", 0.55),
      floor: mix(showColor, "#000000", 0.62),
      screen: mix(showColor, "#05060a", 0.6),
      screenInk: mix(showColor, "#ffffff", 0.88),
      motif: mix(showColor, "#ffffff", 0.42),
      stripe: lightOf(showColor, 0.45),
    };
    setCache.set(showColor, c);
  }
  return c;
}

// ---------------------------------------------------------------------------
// Category motifs for the rear screen (13x13, "#" = ink)

const MOTIFS: Record<string, string[]> = {
  signal: [
    ".............",
    "..#.......#..",
    ".#..#...#..#.",
    "#..#.....#..#",
    "#.#..###..#.#",
    "#.#..###..#.#",
    "#..#..#..#..#",
    ".#..#.#.#..#.",
    "..#...#...#..",
    "......#......",
    ".....###.....",
    "....#####....",
    ".............",
  ],
  chip: [
    "..#.#.#.#.#..",
    "..#.#.#.#.#..",
    "#############",
    ".#.........#.",
    "##.#######.##",
    ".#.#.....#.#.",
    "##.#.###.#.##",
    ".#.#.....#.#.",
    "##.#######.##",
    ".#.........#.",
    "#############",
    "..#.#.#.#.#..",
    "..#.#.#.#.#..",
  ],
  branch: [
    "..###....###.",
    "..#.#....#.#.",
    "..###....###.",
    "...#......#..",
    "...#......#..",
    "...#.....#...",
    "...#....#....",
    "...#..##.....",
    "...###.......",
    "...#.........",
    "..###........",
    "..#.#........",
    "..###........",
  ],
  paper: [
    ".#########...",
    ".#.......##..",
    ".#.###...#.#.",
    ".#.......####",
    ".#.#######..#",
    ".#..........#",
    ".#.#######..#",
    ".#..........#",
    ".#.######...#",
    ".#..........#",
    ".#.#######..#",
    ".#..........#",
    ".############",
  ],
  shield: [
    "......#......",
    "....##.##....",
    "..##.....##..",
    ".#.........#.",
    ".#...###...#.",
    ".#..#...#..#.",
    ".#..#...#..#.",
    ".#.#######.#.",
    "..#.##.##.#..",
    "..#.#####.#..",
    "...#.....#...",
    "....##.##....",
    "......#......",
  ],
  bars: [
    "...........##",
    "...........##",
    "........##.##",
    "........##.##",
    "........##.##",
    ".....##.##.##",
    ".....##.##.##",
    ".....##.##.##",
    "..##.##.##.##",
    "..##.##.##.##",
    "..##.##.##.##",
    "..##.##.##.##",
    "#############",
  ],
  pillars: [
    "......#......",
    "....##.##....",
    "..##.....##..",
    "#############",
    ".............",
    ".##..##..##..",
    ".##..##..##..",
    ".##..##..##..",
    ".##..##..##..",
    ".##..##..##..",
    ".............",
    "#############",
    "#############",
  ],
};

const motifRects = new Map<string, number[]>();
function motifRuns(name: string): number[] {
  let r = motifRects.get(name);
  if (!r) {
    r = [];
    const rows = MOTIFS[name] ?? MOTIFS.signal;
    rows.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        if (row[x] !== "#") {
          x++;
          continue;
        }
        const x0 = x;
        while (x < row.length && row[x] === "#") x++;
        r!.push(x0, y, x - x0);
      }
    });
    motifRects.set(name, r);
  }
  return r;
}

function motifFor(show: Show | undefined): string {
  if (!show) return "signal";
  if (show.categories.length > 3) return "signal";
  switch (show.categories[0]) {
    case "models":
      return "chip";
    case "open_source":
    case "coding_ai":
    case "agents":
      return "branch";
    case "research":
      return "paper";
    case "security":
      return "shield";
    case "funding":
      return "bars";
    case "regulation":
      return "pillars";
    default:
      return "signal";
  }
}

function drawMotif(ctx: PixelCtx, name: string, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  const r = motifRuns(name);
  for (let i = 0; i < r.length; i += 3) ctx.fillRect(x + r[i], y + r[i + 1], r[i + 2], 1);
}

// ---------------------------------------------------------------------------
// Studio

function drawStudio(ctx: PixelCtx, show: Show | undefined): void {
  const c = setColors(show?.color ?? NEUTRAL_SHOW);
  // Back wall with tall panels
  rect(ctx, 0, 0, WIDTH, DESK_TOP, c.wall);
  for (let x = 0; x < WIDTH; x += 40) {
    rect(ctx, x + 3, 6, 34, 76, c.wallPanel);
    rect(ctx, x, 0, 1, DESK_TOP, c.seam);
    rect(ctx, x + 1, 0, 1, DESK_TOP, c.seamLight);
  }
  // Lighting rig across the top
  rect(ctx, 0, 0, WIDTH, 3, c.rig);
  for (let x = 14; x < WIDTH; x += 40) rect(ctx, x, 3, 12, 1, c.rig);
  // Lower wall band behind the desk
  rect(ctx, 0, 84, WIDTH, DESK_TOP - 84, c.wainscot);
  rect(ctx, 0, 84, WIDTH, 1, c.seamLight);
  // Floor either side of the desk
  rect(ctx, 0, DESK_TOP, WIDTH, HEIGHT - DESK_TOP, c.floor);
}

const SCREEN = { x: 64, y: 26, w: 192, h: 27 };

function drawRearScreen(ctx: PixelCtx, show: Show | undefined, lineup: Lineup): void {
  const c = setColors(show?.color ?? NEUTRAL_SHOW);
  const { x, y, w, h } = SCREEN;
  rect(ctx, x - 2, y - 2, w + 4, h + 4, INK);
  rect(ctx, x, y, w, h, c.screen);
  // faint scan rows
  for (let yy = y + 1; yy < y + h; yy += 3) rect(ctx, x, yy, w, 1, mix(c.screen, c.motif, 0.08));

  const name = (show?.name ?? lineup.network).toUpperCase();
  const motif = motifFor(show);
  const w2 = textWidth(name, 2);
  const motifW = 13;
  const gap = 8;
  if (w2 + 2 * (motifW + gap) <= w - 12) {
    const total = w2 + 2 * (motifW + gap);
    const left = x + Math.floor((w - total) / 2);
    drawMotif(ctx, motif, left, y + 7, c.motif);
    drawTextScaled(ctx, name, left + motifW + gap, y + 7, c.screenInk, 2);
    drawMotif(ctx, motif, left + total - motifW, y + 7, c.motif);
  } else if (w2 <= w - 8) {
    drawTextScaled(ctx, name, x + Math.floor((w - w2) / 2), y + 7, c.screenInk, 2);
  } else {
    const t = truncate(name, w - 8);
    drawText(ctx, t, x + Math.floor((w - textWidth(t)) / 2), y + 10, c.screenInk);
  }
}

function drawDesk(ctx: PixelCtx, show: Show | undefined, network: string): void {
  const c = setColors(show?.color ?? NEUTRAL_SHOW);
  const x0 = 26;
  const x1 = WIDTH - 26;
  // Top surface, seen slightly from above
  rect(ctx, x0 + 2, DESK_TOP, x1 - x0 - 4, 1, "#d6dae0");
  rect(ctx, x0, DESK_TOP + 1, x1 - x0, 3, "#9aa1ab");
  rect(ctx, x0, DESK_TOP + 4, x1 - x0, 1, "#5d636d");
  // Front panel
  const fy = DESK_TOP + 5;
  rect(ctx, x0 + 2, fy, x1 - x0 - 4, HEIGHT - fy, "#22252c");
  rect(ctx, x0 + 2, fy, x1 - x0 - 4, 1, "#14161a");
  rect(ctx, x0 + 2, fy + 2, x1 - x0 - 4, 2, c.stripe);
  rect(ctx, x0 + 2, fy + 4, x1 - x0 - 4, 1, shadeOf(c.stripe, 0.4));
  // Side bevels
  rect(ctx, x0 + 2, fy, 2, HEIGHT - fy, "#2d3139");
  rect(ctx, x1 - 4, fy, 2, HEIGHT - fy, "#181a1f");
  // Network mark on the front. Rows 118..131 sit under the caption bar
  // whichever lower third is up, so captions cover it completely.
  const mark = network.toUpperCase();
  const mw = textWidth(mark, 2);
  drawTextScaled(ctx, mark, Math.floor((WIDTH - mw) / 2), fy + 7, PAPER, 2);
}

// ---------------------------------------------------------------------------
// Anchors

interface Seat {
  anchor: Anchor;
  cx: number;
}

function seats(lineup: Lineup, ids: string[]): Seat[] {
  const anchors = ids.map((id) => findAnchor(lineup, id)).filter((a): a is Anchor => !!a);
  const n = anchors.length;
  const spacing = 72;
  return anchors.map((anchor, i) => ({ anchor, cx: Math.round(WIDTH / 2 + (i - (n - 1) / 2) * spacing) }));
}

function drawAnchors(ctx: PixelCtx, input: FrameInput, list: Seat[], cur: CurrentLine | null): void {
  const { nowMs } = input;
  const active = cur && cur.lineElapsedMs < cur.line.durationMs ? cur : null;
  const speakerIdx = active ? list.findIndex((s) => s.anchor.id === active.line.speaker) : -1;

  list.forEach((seat, i) => {
    const { anchor } = seat;
    const speaking = i === speakerIdx;
    const open = speaking && active ? mouthOpenness(active.line, active.lineElapsedMs) : 0;
    let turn: Turn = 0;
    if (!speaking && speakerIdx >= 0) turn = speakerIdx > i ? 1 : -1;
    const dy = breathOffset(nowMs, anchor.id);
    const sx = seat.cx - SPRITE_W / 2;
    const sy = DESK_TOP - SPRITE_DESK_ROW + dy;
    drawAnchor(
      ctx,
      anchor.look,
      { mouth: mouthState(open), blink: isBlinking(nowMs, anchor.id), turn },
      sx,
      sy,
      SPRITE_DESK_ROW + 2 - dy,
    );
  });
}

function drawHands(ctx: PixelCtx, list: Seat[], cur: CurrentLine | null): void {
  const active = cur && cur.lineElapsedMs < cur.line.durationMs ? cur : null;
  list.forEach((seat) => {
    const speaking = !!active && active.line.speaker === seat.anchor.id;
    // A speaker's hands move a little as they talk.
    const beat = speaking && active ? Math.floor(active.lineElapsedMs / 650) % 4 : 0;
    const y = DESK_TOP - HAND_H + 3;
    drawHand(ctx, seat.anchor.look, seat.cx - 19, y - (beat === 1 ? 1 : 0));
    drawHand(ctx, seat.anchor.look, seat.cx + 10, y - (beat === 3 ? 1 : 0));
  });
}

// ---------------------------------------------------------------------------
// Overlays

function drawBug(ctx: PixelCtx, network: string, live: boolean): void {
  const mark = network.toUpperCase();
  const mw = textWidth(mark, 2);
  rect(ctx, 6, 6, mw + 8, 18, INK);
  drawTextScaled(ctx, mark, 10, 8, PAPER, 2);
  if (live) {
    const lx = 6 + mw + 8;
    rect(ctx, lx, 6, textWidth("LIVE") + 8, 11, ACCENT);
    drawText(ctx, "LIVE", lx + 4, 8, PAPER);
  }
}

function drawClock(ctx: PixelCtx, label: string): void {
  const text = normalizeText(label).trim();
  if (!text) return;
  const m = /^(\d{1,2}:\d{2})\s*(.*)$/.exec(text);
  if (m) {
    const big = m[1];
    const small = m[2];
    const bw = textWidth(big, 2);
    const sw = small ? textWidth(small) + 4 : 0;
    const w = bw + sw + 8;
    const x = WIDTH - 6 - w;
    rect(ctx, x, 6, w, 18, INK);
    drawTextScaled(ctx, big, x + 4, 8, PAPER, 2);
    if (small) drawText(ctx, small, x + 4 + bw + 4, 15, MUTED);
  } else {
    const t = truncate(text, 120);
    const w = textWidth(t) + 8;
    rect(ctx, WIDTH - 6 - w, 6, w, 11, INK);
    drawText(ctx, t, WIDTH - 6 - w + 4, 8, PAPER);
  }
}

/** Wrap to at most maxLines, ending the last line with "..." when text was cut. */
function clampLines(text: string, width: number, maxLines: number): string[] {
  const lines = wrap(text, width);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const rest = lines.slice(maxLines - 1).join(" ");
  const maxChars = Math.floor((width + 1) / ADVANCE);
  let last = rest.slice(0, Math.max(0, maxChars - 3));
  const sp = last.lastIndexOf(" ");
  if (sp > maxChars / 2) last = last.slice(0, sp);
  kept[maxLines - 1] = `${last.replace(/[\s,.;:-]+$/, "")}...`;
  return kept;
}

/** Draws the lower third and returns its top y. */
function drawLowerThird(ctx: PixelCtx, segment: Segment, show: Show | undefined, speaker: Anchor | undefined): number {
  const pad = 6;
  const lines = clampLines(segment.title, LT_W - pad * 2, 2);
  const boxH = lines.length * LINE_HEIGHT + 4;
  const boxY = LT_BOTTOM - boxH;
  const stripH = 11;
  const stripY = boxY - stripH;

  // Title box
  rect(ctx, LT_X, boxY, LT_W, boxH, PAPER);
  lines.forEach((l, i) => drawText(ctx, l, LT_X + pad, boxY + 3 + i * LINE_HEIGHT, "#121417"));

  // Strip: show tag, speaker, source
  rect(ctx, LT_X, stripY, LT_W, stripH, INK);
  let x = LT_X;
  const tag = (show?.name ?? segment.showId).toUpperCase();
  const tagW = textWidth(tag) + 8;
  rect(ctx, x, stripY, tagW, stripH, ACCENT);
  drawText(ctx, tag, x + 4, stripY + 2, PAPER);
  x += tagW + 6;

  // Source attribution has priority; the speaker's name shows only when it fits whole.
  const source = segment.articles[0]?.source?.trim();
  const right = LT_X + LT_W - pad;
  let via = source ? truncate(`via ${source}`, right - x) : "";
  if (via.length < 8) via = "";
  const viaW = via ? textWidth(via) : 0;
  if (via) drawText(ctx, via, right - viaW, stripY + 2, MUTED);
  if (speaker) {
    const limit = via ? right - viaW - 12 : right;
    const name = normalizeText(speaker.name).toUpperCase();
    const nameW = textWidth(name);
    if (x + nameW <= limit) {
      drawText(ctx, name, x, stripY + 2, PAPER);
      const roleX = x + nameW + 6;
      if (roleX + textWidth(speaker.role) <= limit) drawText(ctx, speaker.role, roleX, stripY + 2, MUTED);
    }
  }
  return stripY;
}

const CAPTION_TEXT_W = 228;
const CAPTION_W = CAPTION_TEXT_W + 12;
const CAPTION_H = 2 * LINE_HEIGHT + 5;
const CAPTION_HOLD_MS = 1500;

/**
 * Captions for the current line in a fixed-size bar whose bottom edge is at
 * `bottom`. Text stays up through the gap to the next line (like broadcast
 * pop-on captions) and clears CAPTION_HOLD_MS after the last line ends.
 */
function drawCaptions(ctx: PixelCtx, segment: Segment, cur: CurrentLine | null, bottom: number): void {
  if (!cur) return;
  const { line, lineElapsedMs } = cur;
  const isLast = cur.index === segment.lines.length - 1 || !segment.lines.some((l) => l.startMs > line.startMs);
  if (lineElapsedMs < 0 || (isLast && lineElapsedMs >= line.durationMs + CAPTION_HOLD_MS)) return;
  const all = wrap(line.text, CAPTION_TEXT_W);
  if (all.length === 1 && !all[0]) return;
  // Two-line pages, each shown for a share of the line proportional to its length.
  const pages: string[][] = [];
  for (let i = 0; i < all.length; i += 2) pages.push(all.slice(i, i + 2));
  const lens = pages.map((p) => p.join(" ").length + 1);
  const total = lens.reduce((a, b) => a + b, 0);
  const frac = Math.min(0.9999, Math.max(0, lineElapsedMs / Math.max(1, line.durationMs)));
  let acc = 0;
  let page = pages[pages.length - 1];
  for (let i = 0; i < pages.length; i++) {
    acc += lens[i] / total;
    if (frac < acc) {
      page = pages[i];
      break;
    }
  }
  const x = Math.floor((WIDTH - CAPTION_W) / 2);
  const y = bottom - CAPTION_H;
  rect(ctx, x, y, CAPTION_W, CAPTION_H, "#08090b");
  const textH = page.length * LINE_HEIGHT - 1;
  const ty = y + Math.floor((CAPTION_H - textH) / 2);
  page.forEach((l, i) => drawText(ctx, l, x + 6, ty + i * LINE_HEIGHT, PAPER));
}

const TICKER_SPEED = 30; // px per second

function tickerText(input: FrameInput): { label: string; text: string } {
  const titles = input.upcoming.map((s) => normalizeText(s.title).trim()).filter(Boolean);
  if (titles.length > 0) return { label: "UP NEXT", text: titles.join(" / ") };
  // Nothing queued: run the day's grid instead.
  const grid = [...input.lineup.grid].sort((a, b) => a.hourUtc - b.hourUtc);
  const hour = new Date(input.nowMs).getUTCHours();
  const next = grid.filter((g) => g.hourUtc > hour).concat(grid.filter((g) => g.hourUtc <= hour));
  const text = next
    .map((g) => {
      const s = findShow(input.lineup, g.show);
      return s ? `${String(g.hourUtc).padStart(2, "0")}:00 UTC ${s.name}` : "";
    })
    .filter(Boolean)
    .join(" / ");
  return { label: "SCHEDULE", text };
}

function drawTicker(ctx: PixelCtx, input: FrameInput): void {
  rect(ctx, 0, TICKER_Y, WIDTH, TICKER_H, INK);
  const { label, text } = tickerText(input);
  const labelW = textWidth(label) + 10;
  if (text) {
    const loop = `${text} / `;
    const loopW = loop.length * ADVANCE;
    const offset = Math.floor((input.nowMs / 1000) * TICKER_SPEED) % loopW;
    const clip = { x0: labelW, x1: WIDTH };
    for (let x = labelW + 4 - offset; x < WIDTH; x += loopW) {
      drawText(ctx, loop, x, TICKER_Y + 2, PAPER, clip);
    }
  }
  rect(ctx, 0, TICKER_Y, labelW, TICKER_H, PAPER);
  drawText(ctx, label, 5, TICKER_Y + 2, INK);
}

function drawIdentCard(ctx: PixelCtx, show: Show | undefined, lineup: Lineup): number {
  const c = setColors(show?.color ?? NEUTRAL_SHOW);
  const name = show?.name ?? lineup.network;
  const blurb = show ? clampLines(show.blurb, 228, 2) : [];
  const h = 14 + 8 + blurb.length * LINE_HEIGHT + 10;
  const y = LT_BOTTOM - h;
  const x = 36;
  const w = WIDTH - 72;
  rect(ctx, x, y, w, h, mix(c.screen, "#000000", 0.2));
  rect(ctx, x, y, w, 1, PAPER);
  rect(ctx, x, y + h - 1, w, 1, PAPER);
  const nw = textWidth(name, 2);
  if (nw <= w - 12) drawTextScaled(ctx, name, x + Math.floor((w - nw) / 2), y + 6, PAPER, 2);
  else {
    const t = truncate(name, w - 12);
    drawText(ctx, t, x + Math.floor((w - textWidth(t)) / 2), y + 10, PAPER);
  }
  blurb.forEach((l, i) =>
    drawText(ctx, l, x + Math.floor((w - textWidth(l)) / 2), y + 6 + 14 + 6 + i * LINE_HEIGHT, c.screenInk),
  );
  return y;
}

function drawStandby(ctx: PixelCtx, input: FrameInput): void {
  const { lineup } = input;
  const bg = "#14161c";
  rect(ctx, 0, 0, WIDTH, HEIGHT, bg);
  for (let x = 20; x < WIDTH; x += 40) rect(ctx, x, 0, 1, HEIGHT, "#1a1d24");
  for (let y = 30; y < HEIGHT; y += 40) rect(ctx, 0, y, WIDTH, 1, "#1a1d24");

  const mark = lineup.network.toUpperCase();
  const scale = 5;
  const mw = textWidth(mark, scale);
  const my = 42;
  drawTextScaled(ctx, mark, Math.floor((WIDTH - mw) / 2), my, PAPER, scale);
  const tag = "AI NEWS NETWORK";
  // letter-spaced subtitle under the wordmark
  const spaced = tag.split("").join(" ");
  const sw = textWidth(spaced);
  drawText(ctx, spaced, Math.floor((WIDTH - sw) / 2), my + 7 * scale + 8, MUTED);
  rect(ctx, Math.floor((WIDTH - mw) / 2), my + 7 * scale + 20, mw, 1, "#3a3f4a");

  const nextShow = input.upcoming[0] ? findShow(lineup, input.upcoming[0].showId) : undefined;
  const y = my + 7 * scale + 28;
  if (nextShow) {
    const lw = textWidth("NEXT UP");
    drawText(ctx, "NEXT UP", Math.floor((WIDTH - lw) / 2), y, MUTED);
    const n = nextShow.name;
    const nw = textWidth(n, 2);
    if (nw <= WIDTH - 24) drawTextScaled(ctx, n, Math.floor((WIDTH - nw) / 2), y + 12, PAPER, 2);
    else drawText(ctx, truncate(n, WIDTH - 24), 12, y + 12, PAPER);
  } else {
    const t = "Back shortly";
    const tw = textWidth(t, 2);
    drawTextScaled(ctx, t, Math.floor((WIDTH - tw) / 2), y + 6, PAPER, 2);
  }
}

// ---------------------------------------------------------------------------

export function drawFrame(ctx: PixelCtx, input: FrameInput): void {
  const { lineup, segment } = input;

  if (!segment) {
    drawStandby(ctx, input);
    drawClock(ctx, input.clockLabel);
    if (input.upcoming.length > 0) drawTicker(ctx, input);
    return;
  }

  const show = findShow(lineup, segment.showId);
  const cur = currentLine(segment, input.segmentElapsedMs);
  const list = seats(lineup, segment.anchors);

  drawStudio(ctx, show);
  drawRearScreen(ctx, show, lineup);
  drawAnchors(ctx, input, list, cur);
  drawDesk(ctx, show, lineup.network);
  drawHands(ctx, list, cur);

  let overlayTop: number;
  if (segment.kind === "ident") {
    overlayTop = drawIdentCard(ctx, show, lineup);
  } else {
    const speakerId = cur?.line.speaker ?? segment.anchors[0];
    overlayTop = drawLowerThird(ctx, segment, show, speakerId ? findAnchor(lineup, speakerId) : undefined);
  }
  if (input.captions) drawCaptions(ctx, segment, cur, overlayTop - 1);

  drawBug(ctx, lineup.network, true);
  drawClock(ctx, input.clockLabel);
  drawTicker(ctx, input);
}
