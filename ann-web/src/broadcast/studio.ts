// The studio at 640x360: one building, five sets.
//
//   desk       the news desk: city window, two wall monitors, ON AIR sign
//   weather    a presenter standing at the weather wall (map, temperatures)
//   sports     the sports desk under a scoreboard
//   markets    a presenter beside the markets wall (prices, sparklines)
//   latenight  the late-night set: host desk, guest couch, skyline
//
// Walls only ever show real data passed in on the segment's board, with its
// source on screen. With no data a wall says so; it never makes numbers up.

import type { PixelCtx } from "./font";
import { drawText, drawTextScaled, measure, truncate } from "./font";
import { CHAR_DESK_ROW, CHAR_H, LEGS_H } from "./character";
import { lightOf, mix, shadeOf } from "./sprites";
import type { Board, MarketsBoard, Show, SportsBoard, StudioSet, WeatherBoard, WeatherIcon } from "./types";

export const W = 640;
export const H = 360;
export const TICKER_Y = 338;

const INK = "#0d0f13";
const PAPER = "#f2efe8";
const MUTED = "#a3a8b1";
const RED = "#d7263d";
const UP = "#4fbf7a"; // market up, used only for data
const DOWN = "#e0606a"; // market down

export interface Seat {
  cx: number;
  /** Top of the character's bust. */
  top: number;
  standing: boolean;
  /** For a standing presenter: which side their board is on. */
  boardSide: -1 | 0 | 1;
}

export interface Layout {
  set: StudioSet;
  seats: Seat[];
  /** Desk surfaces the seated cast sit behind. */
  desks: { x: number; w: number; top: number; front: number; logo: boolean }[];
}

const DESK_TOP = 262;

export function layoutFor(set: StudioSet, count: number): Layout {
  const seated = (cx: number, top = DESK_TOP): Seat => ({ cx, top: top - CHAR_DESK_ROW, standing: false, boardSide: 0 });
  const floor = 332;
  const standing = (cx: number, boardSide: -1 | 0 | 1): Seat => ({ cx, top: floor - CHAR_H - LEGS_H + 6, standing: true, boardSide });
  switch (set) {
    case "weather":
      return { set, seats: [standing(116, 1)], desks: [] };
    case "markets":
      return { set, seats: [standing(548, -1)], desks: [] };
    case "sports": {
      const xs = count >= 2 ? [244, 396] : [320];
      return { set, seats: xs.map((x) => seated(x, 270)), desks: [{ x: 150, w: 340, top: 270, front: 282, logo: true }] };
    }
    case "latenight":
      return {
        set,
        seats: count >= 2 ? [seated(470), seated(178, 268)] : [seated(470)],
        desks: [{ x: 388, w: 168, top: DESK_TOP, front: DESK_TOP + 12, logo: false }],
      };
    default: {
      const xs = count >= 3 ? [184, 320, 456] : count === 2 ? [232, 408] : [320];
      return { set: "desk", seats: xs.map((x) => seated(x)), desks: [{ x: 124, w: 392, top: DESK_TOP, front: DESK_TOP + 12, logo: true }] };
    }
  }
}

function rect(ctx: PixelCtx, x: number, y: number, w: number, h: number, c: string): void {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

// ---------------------------------------------------------------------------
// Time of day (US Eastern) for the windows and skylines

function easternHour(nowMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23", minute: "numeric" }).formatToParts(new Date(nowMs));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h + m / 60;
}

interface Sky {
  bands: string[];
  lit: number; // share of windows lit
  sun: boolean;
}

function skyFor(nowMs: number): Sky {
  const h = easternHour(nowMs);
  if (h >= 7 && h < 17) return { bands: ["#5f9fd8", "#73afe0", "#8cc0e8", "#a6d0ee"], lit: 0.08, sun: true };
  if (h >= 17 && h < 19.5) return { bands: ["#3b3a78", "#7a4f8a", "#d2707a", "#f2a65e"], lit: 0.4, sun: false };
  if (h >= 5 && h < 7) return { bands: ["#2c3a6e", "#5a5c8e", "#c08a8a", "#f0c08a"], lit: 0.35, sun: false };
  return { bands: ["#0b1026", "#121a3a", "#1a2450", "#24305e"], lit: 0.6, sun: false };
}

function hash(n: number): number {
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** A city skyline filling (x, y, w, h), lit for the hour; windows flicker on and off slowly. */
function skyline(ctx: PixelCtx, x: number, y: number, w: number, h: number, nowMs: number, seed: number): void {
  const sky = skyFor(nowMs);
  const bh = Math.ceil(h / sky.bands.length);
  sky.bands.forEach((c, i) => rect(ctx, x, y + i * bh, w, bh, c));
  if (sky.sun) {
    rect(ctx, x + w - 46, y + 12, 14, 14, "#fff3c4");
    rect(ctx, x + w - 44, y + 10, 10, 18, "#fff3c4");
  } else if (sky.lit > 0.5) {
    rect(ctx, x + w - 42, y + 12, 10, 10, "#e8e6d8");
    rect(ctx, x + w - 39, y + 12, 7, 7, sky.bands[0]);
    for (let i = 0; i < 10; i++) rect(ctx, x + hash(seed + i) * w, y + hash(seed + 40 + i) * h * 0.4, 1, 1, "#d8dcf0");
  }
  // Two rows of buildings, the far row paler.
  const layers: [number, number, string, string][] = [
    [0.55, 0, mix(sky.bands[2], "#1a2030", 0.55), "#e8d08a"],
    [0.85, 1, mix(sky.bands[3], "#0a0e18", 0.72), "#ffd978"],
  ];
  for (const [maxH, layer, body, lightCol] of layers) {
    let bx = x - 4;
    let i = 0;
    while (bx < x + w) {
      const r = hash(seed * 7 + layer * 1000 + i);
      const bw = 18 + Math.floor(r * 26);
      const top = y + h - Math.floor(h * (0.25 + hash(seed + i * 3 + layer) * maxH));
      const cw = Math.min(bw, x + w - bx);
      rect(ctx, Math.max(bx, x), top, cw - (bx < x ? x - bx : 0), y + h - top, body);
      // Windows: 2x2, on a 5-pixel grid.
      for (let wy = top + 4; wy < y + h - 4; wy += 6) {
        for (let wx = bx + 3; wx < bx + bw - 3 && wx < x + w - 2; wx += 5) {
          if (wx < x) continue;
          const k = hash(seed * 13 + wx * 31 + wy * 17 + Math.floor(nowMs / 60000) * (hash(wx + wy) < 0.05 ? 1 : 0));
          if (k < sky.lit) rect(ctx, wx, wy, 2, 2, lightCol);
        }
      }
      bx += bw + 2;
      i++;
    }
  }
}

// ---------------------------------------------------------------------------
// Room

interface Room {
  wall: string;
  panel: string;
  seam: string;
  trim: string;
  floor: string;
  accent: string;
}

function roomFor(show: Show | undefined): Room {
  const c = show?.color ?? "#1d3557";
  return {
    wall: lightOf(c, 0.12),
    panel: lightOf(c, 0.2),
    seam: shadeOf(c, 0.25),
    trim: lightOf(c, 0.42),
    floor: mix(c, "#000000", 0.6),
    accent: lightOf(c, 0.55),
  };
}

function room(ctx: PixelCtx, r: Room): void {
  rect(ctx, 0, 0, W, H, r.wall);
  // Tall wall panels with seams and a lit edge.
  for (let x = 0; x < W; x += 40) {
    rect(ctx, x + 2, 18, 36, 250, r.panel);
    rect(ctx, x, 18, 2, 250, r.seam);
    rect(ctx, x + 2, 18, 1, 250, r.trim);
  }
  // Ceiling: a lighting rig with a row of lamps.
  rect(ctx, 0, 0, W, 14, mix(r.wall, "#000000", 0.6));
  for (let x = 24; x < W; x += 64) {
    rect(ctx, x, 10, 10, 6, "#2a2a30");
    rect(ctx, x + 2, 14, 6, 2, "#fff6d0");
  }
  // Floor
  rect(ctx, 0, 268, W, H - 268, r.floor);
  for (let x = 0; x < W; x += 32) rect(ctx, x, 268, 1, H - 268, mix(r.floor, "#ffffff", 0.06));
  rect(ctx, 0, 268, W, 2, mix(r.floor, "#ffffff", 0.12));
}

function frame(ctx: PixelCtx, x: number, y: number, w: number, h: number, inner: string): void {
  rect(ctx, x - 4, y - 4, w + 8, h + 8, "#15161c");
  rect(ctx, x - 2, y - 2, w + 4, h + 4, "#2c2e38");
  rect(ctx, x, y, w, h, inner);
}

/** A wall monitor with a stand-off bracket. */
function monitor(ctx: PixelCtx, x: number, y: number, w: number, h: number, inner: string): void {
  rect(ctx, x + w / 2 - 6, y + h + 4, 12, 8, "#15161c");
  frame(ctx, x, y, w, h, inner);
}

function onAir(ctx: PixelCtx, cx: number, y: number, nowMs: number): void {
  const text = "ON AIR";
  const tw = measure(text);
  rect(ctx, cx - tw / 2 - 6, y, tw + 12, 16, "#1a0a0e");
  rect(ctx, cx - tw / 2 - 4, y + 2, tw + 8, 12, "#2a0e14");
  // A faint flicker now and then, like an old sign.
  const lit = Math.floor(nowMs / 97) % 53 !== 0;
  drawText(ctx, text, Math.round(cx - tw / 2), y + 4, lit ? "#ff4a5e" : "#7a2030");
}

// ---------------------------------------------------------------------------
// Sets

export interface BackdropInput {
  nowMs: number;
  show: Show | undefined;
  network: string;
  headline: string;
  source: string;
  board: Board | null | undefined;
  /** For the motif monitor: the show's name. */
  showName: string;
}

export function drawBackdrop(ctx: PixelCtx, layout: Layout, input: BackdropInput): void {
  const r = roomFor(input.show);
  room(ctx, r);
  switch (layout.set) {
    case "weather":
      weatherWall(ctx, input, r);
      break;
    case "sports":
      sportsWall(ctx, input, r);
      break;
    case "markets":
      marketsWall(ctx, input, r);
      break;
    case "latenight":
      lateNight(ctx, input, r);
      break;
    default:
      newsDesk(ctx, input, r);
  }
  // Chair backs behind seated anchors.
  for (const seat of layout.seats) {
    if (seat.standing) continue;
    const top = seat.top + 54;
    rect(ctx, seat.cx - 38, top, 76, 120, "#16121c");
    rect(ctx, seat.cx - 36, top + 2, 72, 118, "#241d2c");
    rect(ctx, seat.cx - 34, top + 4, 4, 110, "#32283c");
  }
}

function newsDesk(ctx: PixelCtx, input: BackdropInput, r: Room): void {
  // The big window on the city.
  const wx = 196;
  const wy = 36;
  const ww = 248;
  const wh = 168;
  frame(ctx, wx, wy, ww, wh, "#000");
  skyline(ctx, wx, wy, ww, wh, input.nowMs, 11);
  for (let i = 1; i < 3; i++) rect(ctx, wx + (ww / 3) * i - 1, wy, 3, wh, "#2c2e38");
  rect(ctx, wx, wy + 56, ww, 2, "#2c2e38");
  onAir(ctx, 320, 222, input.nowMs);

  // Left monitor: the show's card.
  monitor(ctx, 24, 44, 152, 104, mix(r.wall, "#05060a", 0.7));
  drawText(ctx, "LIVE", 32, 52, PAPER);
  rect(ctx, 30, 50, measure("LIVE") + 4, 11, RED);
  drawText(ctx, "LIVE", 32, 52, PAPER);
  const name = input.showName.toUpperCase();
  const nw = measure(name) * 2;
  drawTextScaled(ctx, name, Math.round(100 - Math.min(nw, 140) / 2), 84, PAPER, nw <= 140 ? 2 : 1);
  drawText(ctx, truncate(input.network + " NEWS DESK", 136), 32, 128, MUTED);

  // Right monitor: the story on air, with its source.
  monitor(ctx, 464, 44, 152, 104, "#123a7a");
  rect(ctx, 464, 124, 152, 2, "#e3b341");
  const words = input.headline ? input.headline.toUpperCase() : "MORE NEWS IN A MOMENT";
  wrapInto(ctx, words, 472, 54, 136, 4, PAPER);
  if (input.source) drawText(ctx, truncate(`Source: ${input.source}`, 136), 472, 132, "#cfe0ff");
}

function wrapInto(ctx: PixelCtx, text: string, x: number, y: number, w: number, maxLines: number, color: string): void {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (measure(next) * 2 <= w) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  const scale = lines.length <= maxLines ? 2 : 1;
  const shown = scale === 2 ? lines : wrapSmall(text, w);
  shown.slice(0, scale === 2 ? maxLines : 7).forEach((l, i) => {
    if (scale === 2) drawTextScaled(ctx, l, x, y + i * 18, color, 2);
    else drawText(ctx, l, x, y + i * 10, color);
  });
}

function wrapSmall(text: string, w: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const word of text.split(/\s+/)) {
    const next = cur ? `${cur} ${word}` : word;
    if (measure(next) <= w) cur = next;
    else {
      if (cur) out.push(cur);
      cur = word;
    }
  }
  if (cur) out.push(cur);
  return out;
}

// --- weather -----------------------------------------------------------------

// The lower 48, coarse, as (lon, lat).
const US: [number, number][] = [
  [-124.7, 48.4], [-124.1, 46.2], [-124.4, 42.0], [-124.3, 40.4], [-122.5, 37.8], [-120.6, 34.6], [-117.1, 32.5],
  [-114.7, 32.7], [-111.0, 31.3], [-108.2, 31.3], [-106.5, 31.8], [-104.5, 29.6], [-103.0, 29.0], [-101.4, 29.8],
  [-99.5, 27.5], [-97.4, 25.9], [-97.2, 27.8], [-95.0, 29.3], [-93.8, 29.7], [-90.3, 29.1], [-89.0, 30.2],
  [-85.3, 29.7], [-84.0, 30.0], [-82.8, 27.9], [-81.8, 26.1], [-80.4, 25.2], [-80.1, 26.9], [-81.3, 30.4],
  [-80.9, 32.1], [-78.5, 33.8], [-75.5, 35.3], [-76.3, 37.0], [-75.2, 38.6], [-74.0, 40.5], [-71.8, 41.3],
  [-70.0, 41.7], [-70.6, 42.7], [-70.2, 43.7], [-67.1, 44.8], [-67.8, 47.1], [-69.2, 47.4], [-71.5, 45.0],
  [-74.8, 45.0], [-76.5, 44.2], [-79.1, 43.3], [-83.0, 41.8], [-82.4, 43.0], [-84.0, 46.4], [-88.0, 48.0],
  [-89.6, 48.0], [-95.2, 49.0], [-123.0, 49.0],
];

const MAP = { x: 228, y: 64, w: 384, h: 192, lon0: -126, lon1: -66, lat0: 24, lat1: 50 };
const px = (lon: number) => MAP.x + ((lon - MAP.lon0) / (MAP.lon1 - MAP.lon0)) * MAP.w;
const py = (lat: number) => MAP.y + ((MAP.lat1 - lat) / (MAP.lat1 - MAP.lat0)) * MAP.h;

let usRuns: number[] | null = null;
function usMapRuns(): number[] {
  if (usRuns) return usRuns;
  const pts = US.map(([lon, lat]) => [px(lon), py(lat)]);
  const runs: number[] = [];
  for (let y = MAP.y; y < MAP.y + MAP.h; y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) runs.push(Math.round(xs[i]), y, Math.round(xs[i + 1] - xs[i]));
  }
  usRuns = runs;
  return runs;
}

const ICONS: Record<WeatherIcon, string[]> = {
  sun: ["....y....", ".y..y..y.", "..yyyyy..", ".yyyyyyy.", "yyyyyyyyy", ".yyyyyyy.", "..yyyyy..", ".y..y..y.", "....y...."],
  partly: ["..y......", "y.yyy....", ".yyyyy...", "yyyyw ww.", ".yywwwwww", "..wwwwwww", ".wwwwwwww", "........."],
  cloud: ["...www...", "..wwwww..", ".wwwwwwww", "wwwwwwwww", "wwwwwwwww", ".wwwwwww.", "........."],
  rain: ["...www...", "..wwwww..", ".wwwwwwww", "wwwwwwwww", ".wwwwwww.", ".b..b..b.", "b..b..b..", "........."],
  storm: ["...www...", "..wwwww..", ".wwwwwwww", "wwwwwwwww", ".wwwyyww.", "....yy...", "...yy....", "...y....."],
  snow: ["...www...", "..wwwww..", ".wwwwwwww", "wwwwwwwww", ".wwwwwww.", ".w..w..w.", "..w..w..w", "........."],
  fog: ["wwwwwww..", ".........", "..wwwwwww", ".........", "wwwwwww..", ".........", "..wwwwwww"],
  night: ["..www....", ".ww......", "ww.......", "ww.......", "ww.......", ".ww....w.", "..wwwww..", "........."],
};
const ICON_COLORS: Record<string, string> = { y: "#ffd84a", w: "#eef2f8", b: "#7ec8f0" };

function icon(ctx: PixelCtx, name: WeatherIcon, x: number, y: number): void {
  (ICONS[name] ?? ICONS.cloud).forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) {
      const c = ICON_COLORS[row[dx]];
      if (c) rect(ctx, x + dx, y + dy, 1, 1, c);
    }
  });
}

function weatherWall(ctx: PixelCtx, input: BackdropInput, r: Room): void {
  frame(ctx, 212, 28, 412, 238, "#0f2a4a");
  rect(ctx, 212, 28, 412, 22, "#173b66");
  drawTextScaled(ctx, "WEATHER", 222, 32, PAPER, 2);
  const board = input.board?.kind === "weather" ? (input.board as WeatherBoard) : null;
  // Sea, land, a faint grid.
  rect(ctx, MAP.x, MAP.y, MAP.w, MAP.h, "#123760");
  for (let gx = MAP.x; gx < MAP.x + MAP.w; gx += 32) rect(ctx, gx, MAP.y, 1, MAP.h, "#16406e");
  for (let gy = MAP.y; gy < MAP.y + MAP.h; gy += 32) rect(ctx, MAP.x, gy, MAP.w, 1, "#16406e");
  const runs = usMapRuns();
  for (let i = 0; i < runs.length; i += 3) rect(ctx, runs[i], runs[i + 1], runs[i + 2], 1, "#3f7a4a");
  for (let i = 0; i < runs.length; i += 3) {
    rect(ctx, runs[i], runs[i + 1], 1, 1, "#2a5a36");
    rect(ctx, runs[i] + runs[i + 2] - 1, runs[i + 1], 1, 1, "#2a5a36");
  }
  if (!board || board.places.length === 0) {
    drawText(ctx, "No forecast data right now", MAP.x + 110, MAP.y + MAP.h / 2, PAPER);
    return;
  }
  for (const p of board.places) {
    const x = Math.round(px(p.lon));
    const y = Math.round(py(p.lat));
    rect(ctx, x - 1, y - 1, 3, 3, PAPER);
    const temp = `${Math.round(p.tempF)}F`;
    const label = p.name.toUpperCase();
    const bw = Math.max(measure(temp) * 2, measure(label)) + 16;
    const bx = Math.min(MAP.x + MAP.w - bw, Math.max(MAP.x, x - bw / 2));
    const by = y - 34;
    rect(ctx, bx, by, bw, 30, "rgba(8,16,30,0.82)");
    icon(ctx, p.icon, bx + 2, by + 3);
    drawTextScaled(ctx, temp, bx + 13, by + 2, PAPER, 2);
    drawText(ctx, label, bx + 2, by + 20, "#cfe0ff");
  }
  drawText(ctx, truncate(`Data: ${board.source}`, 200), 222, 254, "#cfe0ff");
  void r;
}

// --- sports ------------------------------------------------------------------

function sportsWall(ctx: PixelCtx, input: BackdropInput, r: Room): void {
  frame(ctx, 40, 26, 560, 168, "#0a1a12");
  rect(ctx, 40, 26, 560, 22, "#11402a");
  drawTextScaled(ctx, "SCOREBOARD", 50, 30, "#e8f5d0", 2);
  const board = input.board?.kind === "sports" ? (input.board as SportsBoard) : null;
  if (!board || board.games.length === 0) {
    drawText(ctx, "No scores right now", 260, 110, PAPER);
  } else {
    board.games.slice(0, 6).forEach((g, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = 52 + col * 182;
      const y = 56 + row * 66;
      rect(ctx, x, y, 172, 58, "#102a1c");
      rect(ctx, x, y, 172, 11, "#1a4a30");
      drawText(ctx, truncate(`${g.league}  ${g.status}`.toUpperCase(), 166), x + 3, y + 2, "#c8e6b0");
      const score = (n: number | null) => (n === null ? "-" : String(n));
      drawTextScaled(ctx, truncate(g.away.toUpperCase(), 100), x + 4, y + 16, PAPER, 2);
      drawTextScaled(ctx, score(g.awayScore), x + 172 - measure(score(g.awayScore)) * 2 - 6, y + 16, "#ffd84a", 2);
      drawTextScaled(ctx, truncate(g.home.toUpperCase(), 100), x + 4, y + 36, PAPER, 2);
      drawTextScaled(ctx, score(g.homeScore), x + 172 - measure(score(g.homeScore)) * 2 - 6, y + 36, "#ffd84a", 2);
    });
    drawText(ctx, truncate(`Data: ${board.source}`, 300), 52, 184, "#c8e6b0");
  }
  // Pennants on the wall either side.
  for (const x of [8, 610]) {
    rect(ctx, x, 210, 22, 3, r.trim);
    rect(ctx, x + 2, 213, 18, 22, "#d7263d");
    rect(ctx, x + 6, 235, 10, 6, "#d7263d");
  }
}

// --- markets -----------------------------------------------------------------

function marketsWall(ctx: PixelCtx, input: BackdropInput, r: Room): void {
  frame(ctx, 24, 26, 444, 240, "#0b0e16");
  rect(ctx, 24, 26, 444, 22, "#18203a");
  drawTextScaled(ctx, "MARKETS", 34, 30, PAPER, 2);
  const board = input.board?.kind === "markets" ? (input.board as MarketsBoard) : null;
  if (!board || board.quotes.length === 0) {
    drawText(ctx, "No market data right now", 170, 140, PAPER);
    return;
  }
  board.quotes.slice(0, 6).forEach((q, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 34 + col * 216;
    const y = 56 + row * 66;
    rect(ctx, x, y, 208, 58, "#121a2c");
    drawTextScaled(ctx, q.symbol.toUpperCase(), x + 4, y + 4, PAPER, 2);
    drawText(ctx, truncate(q.name, 100), x + 4, y + 22, MUTED);
    const price = q.price >= 1000 ? q.price.toLocaleString("en-US", { maximumFractionDigits: 0 }) : q.price.toFixed(2);
    drawTextScaled(ctx, price, x + 4, y + 36, PAPER, 2);
    const pct = `${q.changePct >= 0 ? "+" : ""}${q.changePct.toFixed(2)}%`;
    drawText(ctx, pct, x + 204 - measure(pct), y + 6, q.changePct >= 0 ? UP : DOWN);
    // Sparkline
    if (q.spark.length > 1) {
      const lo = Math.min(...q.spark);
      const hi = Math.max(...q.spark);
      const sx = x + 112;
      const sw = 90;
      for (let k = 0; k < sw; k++) {
        const v = q.spark[Math.floor((k / sw) * (q.spark.length - 1))];
        const yy = y + 52 - ((v - lo) / Math.max(1e-9, hi - lo)) * 28;
        rect(ctx, sx + k, Math.round(yy), 1, 2, q.changePct >= 0 ? UP : DOWN);
      }
    }
  });
  drawText(ctx, truncate(`Data: ${board.source}`, 300), 34, 256, MUTED);
  void r;
}

// --- late night ----------------------------------------------------------------

function lateNight(ctx: PixelCtx, input: BackdropInput, r: Room): void {
  // A wide skyline backdrop across the whole back wall.
  frame(ctx, 16, 24, 608, 214, "#000");
  skyline(ctx, 16, 24, 608, 214, input.nowMs, 29);
  // Curtains either side.
  for (const x of [0, 596]) {
    rect(ctx, x, 14, 44, 256, "#5a1622");
    for (let k = 0; k < 44; k += 8) rect(ctx, x + k, 14, 2, 256, "#3e0e18");
  }
  // Couch: back now, cushions and arms are drawn in front of the guest.
  rect(ctx, 98, 210, 168, 60, "#5b3a6e");
  rect(ctx, 98, 210, 168, 4, "#7a5490");
  // A plant beside the desk.
  rect(ctx, 572, 236, 20, 30, "#7a4a2a");
  for (let k = 0; k < 7; k++) rect(ctx, 566 + k * 5, 200 + (k % 3) * 8, 4, 40 - (k % 3) * 8, "#3f8a4a");
  void r;
}

/** Desk surfaces and fronts, drawn over the seated cast's lower bodies. */
export function drawDeskTops(ctx: PixelCtx, layout: Layout): void {
  for (const d of layout.desks) {
    rect(ctx, d.x, d.top, d.w, d.front - d.top, "#d8dbe2");
    rect(ctx, d.x, d.top, d.w, 2, "#f2f4f8");
    rect(ctx, d.x, d.front - 2, d.w, 2, "#a8acb6");
  }
}

export function drawDeskFronts(ctx: PixelCtx, layout: Layout, network: string, show: Show | undefined): void {
  const accent = show?.color ?? "#1d3557";
  for (const d of layout.desks) {
    const h = 330 - d.front;
    rect(ctx, d.x + 8, d.front, d.w - 16, h, mix(accent, "#0a0c14", 0.25));
    rect(ctx, d.x + 8, d.front, d.w - 16, 3, mix(accent, "#000000", 0.5));
    rect(ctx, d.x + 8, d.front + h - 12, d.w - 16, 6, RED);
    rect(ctx, d.x + 8, d.front + h - 6, d.w - 16, 3, "#e3b341");
    if (d.logo) {
      const mark = network.toUpperCase();
      const mw = measure(mark) * 4;
      drawTextScaled(ctx, mark, Math.round(d.x + d.w / 2 - mw / 2), d.front + 12, PAPER, 4);
    }
  }
  if (layout.set === "latenight") {
    // The couch's front cushions and arms cover the guest's lower body.
    rect(ctx, 88, 262, 188, 40, "#6b4680");
    rect(ctx, 88, 262, 188, 4, "#8a62a0");
    rect(ctx, 84, 236, 16, 66, "#4e2f60");
    rect(ctx, 264, 236, 16, 66, "#4e2f60");
  }
}
