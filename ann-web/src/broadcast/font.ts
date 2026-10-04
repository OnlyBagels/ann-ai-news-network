// Hand-drawn 5x7 bitmap font for the broadcast renderer.
//
// Cell: 5 px wide, 8 rows tall. Capitals, digits and most lowercase sit in
// rows 0..6; descenders (g j p q y , ;) use row 7. Advance is 6 px (1 px
// spacing) and the line height is 9, so a descender never touches the
// capitals of the next line.
//
// Drawing only uses fillStyle + fillRect with integer coordinates, so it
// renders identically in a browser canvas and in @napi-rs/canvas.

/** Minimal 2D context the renderer needs. Browser and @napi-rs/canvas contexts both satisfy it. */
export interface PixelCtx {
  fillStyle: unknown;
  fillRect(x: number, y: number, w: number, h: number): void;
}

export const GLYPH_W = 5;
export const GLYPH_H = 8;
export const CAP_H = 7;
export const ADVANCE = 6;
export const LINE_HEIGHT = 9;

// Rows are separated by "/", "#" is ink. Missing rows are blank.
const GLYPHS: Record<string, string> = {
  " ": "",
  "!": "..#../..#../..#../..#../..#../...../..#..",
  '"': ".#.#./.#.#./.#.#.",
  "#": ".#.#./.#.#./#####/.#.#./#####/.#.#./.#.#.",
  $: "..#../.####/#.#../.###./..#.#/####./..#..",
  "%": "##.../##..#/...#./..#../.#.../#..##/...##",
  "&": ".##../#..#./#.#../.#.../#.#.#/#..#./.##.#",
  "'": "..#../..#../.#...",
  "(": "...#./..#../.#.../.#.../.#.../..#../...#.",
  ")": ".#.../..#../...#./...#./...#./..#../.#...",
  "*": "...../..#../#.#.#/.###./#.#.#/..#../.....",
  "+": "...../..#../..#../#####/..#../..#../.....",
  ",": "...../...../...../...../...../.##../..#../.#...",
  "-": "...../...../...../.###.",
  ".": "...../...../...../...../...../.##../.##..",
  "/": "...../....#/...#./..#../.#.../#..../.....",
  "0": ".###./#...#/#..##/#.#.#/##..#/#...#/.###.",
  "1": "..#../.##../..#../..#../..#../..#../.###.",
  "2": ".###./#...#/....#/...#./..#../.#.../#####",
  "3": "#####/...#./..#../...#./....#/#...#/.###.",
  "4": "...#./..##./.#.#./#..#./#####/...#./...#.",
  "5": "#####/#..../####./....#/....#/#...#/.###.",
  "6": "..##./.#.../#..../####./#...#/#...#/.###.",
  "7": "#####/....#/...#./..#../.#.../.#.../.#...",
  "8": ".###./#...#/#...#/.###./#...#/#...#/.###.",
  "9": ".###./#...#/#...#/.####/....#/...#./.##..",
  ":": "...../.##../.##../...../.##../.##../.....",
  ";": "...../.##../.##../...../.##../..#../.#...",
  "<": "...#./..#../.#.../#..../.#.../..#../...#.",
  "=": "...../...../#####/...../#####/...../.....",
  ">": ".#.../..#../...#./....#/...#./..#../.#...",
  "?": ".###./#...#/....#/...#./..#../...../..#..",
  "@": ".###./#...#/#.###/#.#.#/#.###/#..../.###.",
  A: ".###./#...#/#...#/#####/#...#/#...#/#...#",
  B: "####./#...#/#...#/####./#...#/#...#/####.",
  C: ".###./#...#/#..../#..../#..../#...#/.###.",
  D: "####./#...#/#...#/#...#/#...#/#...#/####.",
  E: "#####/#..../#..../####./#..../#..../#####",
  F: "#####/#..../#..../####./#..../#..../#....",
  G: ".###./#...#/#..../#.###/#...#/#...#/.####",
  H: "#...#/#...#/#...#/#####/#...#/#...#/#...#",
  I: ".###./..#../..#../..#../..#../..#../.###.",
  J: "..###/...#./...#./...#./...#./#..#./.##..",
  K: "#...#/#..#./#.#../##.../#.#../#..#./#...#",
  L: "#..../#..../#..../#..../#..../#..../#####",
  M: "#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#",
  N: "#...#/#...#/##..#/#.#.#/#..##/#...#/#...#",
  O: ".###./#...#/#...#/#...#/#...#/#...#/.###.",
  P: "####./#...#/#...#/####./#..../#..../#....",
  Q: ".###./#...#/#...#/#...#/#.#.#/#..#./.##.#",
  R: "####./#...#/#...#/####./#.#../#..#./#...#",
  S: ".####/#..../#..../.###./....#/....#/####.",
  T: "#####/..#../..#../..#../..#../..#../..#..",
  U: "#...#/#...#/#...#/#...#/#...#/#...#/.###.",
  V: "#...#/#...#/#...#/#...#/#...#/.#.#./..#..",
  W: "#...#/#...#/#...#/#.#.#/#.#.#/#.#.#/.#.#.",
  X: "#...#/#...#/.#.#./..#../.#.#./#...#/#...#",
  Y: "#...#/#...#/.#.#./..#../..#../..#../..#..",
  Z: "#####/....#/...#./..#../.#.../#..../#####",
  "[": ".###./.#.../.#.../.#.../.#.../.#.../.###.",
  "\\": "...../#..../.#.../..#../...#./....#/.....",
  "]": ".###./...#./...#./...#./...#./...#./.###.",
  "^": "..#../.#.#./#...#",
  _: "...../...../...../...../...../...../#####",
  "`": ".#.../..#..",
  a: "...../...../.###./....#/.####/#...#/.####",
  b: "#..../#..../#.##./##..#/#...#/#...#/####.",
  c: "...../...../.###./#..../#..../#...#/.###.",
  d: "....#/....#/.##.#/#..##/#...#/#...#/.####",
  e: "...../...../.###./#...#/#####/#..../.###.",
  f: "..##./.#..#/.#.../###../.#.../.#.../.#...",
  g: "...../...../.####/#...#/#...#/.####/....#/.###.",
  h: "#..../#..../#.##./##..#/#...#/#...#/#...#",
  i: "..#../...../.##../..#../..#../..#../.###.",
  j: "...#./...../..##./...#./...#./...#./#..#./.##..",
  k: "#..../#..../#..#./#.#../##.../#.#../#..#.",
  l: ".##../..#../..#../..#../..#../..#../.###.",
  m: "...../...../##.#./#.#.#/#.#.#/#.#.#/#.#.#",
  n: "...../...../#.##./##..#/#...#/#...#/#...#",
  o: "...../...../.###./#...#/#...#/#...#/.###.",
  p: "...../...../####./#...#/#...#/####./#..../#....",
  q: "...../...../.####/#...#/#...#/.####/....#/....#",
  r: "...../...../#.##./##..#/#..../#..../#....",
  s: "...../...../.####/#..../.###./....#/####.",
  t: ".#.../.#.../####./.#.../.#.../.#..#/..##.",
  u: "...../...../#...#/#...#/#...#/#..##/.##.#",
  v: "...../...../#...#/#...#/#...#/.#.#./..#..",
  w: "...../...../#...#/#...#/#.#.#/#.#.#/.#.#.",
  x: "...../...../#...#/.#.#./..#../.#.#./#...#",
  y: "...../...../#...#/#...#/#...#/.####/....#/.###.",
  z: "...../...../#####/...#./..#../.#.../#####",
  "{": "...#./..#../..#../.#.../..#../..#../...#.",
  "|": "..#../..#../..#../..#../..#../..#../..#..",
  "}": ".#.../..#../..#../...#./..#../..#../.#...",
  "~": "...../...../.#.../#.#.#/...#./...../.....",
};

// Each glyph compiles to a flat list of rectangles [x, y, w, h, ...]:
// horizontal runs per row, merged downward when the next row repeats them.
const RECTS: (Int8Array | null)[] = new Array(128).fill(null);

function compileGlyph(src: string): Int8Array {
  const rows = src ? src.split("/") : [];
  const grid: boolean[][] = [];
  for (let y = 0; y < GLYPH_H; y++) {
    const row = rows[y] ?? "";
    const r: boolean[] = [];
    for (let x = 0; x < GLYPH_W; x++) r.push(row[x] === "#");
    grid.push(r);
  }
  const runs: number[][] = []; // [x, y, w, h]
  let prev: number[][] = [];
  for (let y = 0; y < GLYPH_H; y++) {
    const cur: number[][] = [];
    let x = 0;
    while (x < GLYPH_W) {
      if (!grid[y][x]) {
        x++;
        continue;
      }
      const x0 = x;
      while (x < GLYPH_W && grid[y][x]) x++;
      const w = x - x0;
      const above = prev.find((r) => r[0] === x0 && r[2] === w && r[1] + r[3] === y);
      if (above) {
        above[3]++;
        cur.push(above);
      } else {
        const r = [x0, y, w, 1];
        runs.push(r);
        cur.push(r);
      }
    }
    prev = cur;
  }
  return Int8Array.from(runs.flat());
}

for (const [ch, src] of Object.entries(GLYPHS)) {
  RECTS[ch.charCodeAt(0)] = compileGlyph(src);
}

// ---------------------------------------------------------------------------
// Unicode -> ASCII

const CHAR_MAP: Record<string, string> = {
  "‘": "'", "’": "'", "‚": "'", "‛": "'", "′": "'", "´": "'",
  "“": '"', "”": '"', "„": '"', "‟": '"', "″": '"', "«": '"', "»": '"',
  "‹": "'", "›": "'",
  "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", "―": "-", "−": "-",
  "…": "...",
  "•": "-", "·": "-", "‧": "-",
  "×": "x", "÷": "/", "⁄": "/", "∕": "/",
  "→": "->", "←": "<-", "↔": "<->", "⇒": "=>",
  "≤": "<=", "≥": ">=", "≠": "!=", "≈": "~", "±": "+/-",
  "€": "EUR ", "£": "GBP ", "¥": "JPY ", "₹": "INR ",
  "©": "(c)", "®": "", "™": "", "°": "",
  "ß": "ss", "æ": "ae", "Æ": "AE", "ø": "o", "Ø": "O",
  "œ": "oe", "Œ": "OE", "ł": "l", "Ł": "L", "đ": "d", "Đ": "D",
  "þ": "th", "Þ": "Th", "ð": "d", "ı": "i",
  " ": " ", " ": " ", " ": " ", " ": " ", " ": " ", "　": " ",
  "\t": " ", "\n": " ", "\r": " ",
};

const DROP = /[\u200B-\u200D\u2060\uFEFF\uFE00-\uFE0F]|\p{Extended_Pictographic}|\p{Emoji_Modifier}|[\u{E0020}-\u{E007F}]/gu;
const PRINTABLE = /^[\x20-\x7E]*$/;

function mapChars(s: string): string {
  let out = "";
  for (const ch of s) out += CHAR_MAP[ch] ?? ch;
  return out;
}

/**
 * Map arbitrary text onto the font's printable ASCII: smart quotes and dashes
 * become ' " -, accents are stripped, emoji are dropped, anything else that
 * has no ASCII form becomes "?". Whitespace becomes single spaces (runs are
 * kept, so callers can space text out deliberately).
 */
export function normalizeText(s: string): string {
  if (PRINTABLE.test(s)) return s;
  let t = mapChars(s).replace(DROP, "");
  t = t.normalize("NFKD").replace(/\p{M}/gu, "");
  t = mapChars(t);
  let out = "";
  for (const ch of t) {
    const c = ch.codePointAt(0)!;
    out += c >= 32 && c <= 126 ? ch : "?";
  }
  // Dropped characters can leave doubled spaces behind.
  return out.replace(/ {2,}/g, " ");
}

// ---------------------------------------------------------------------------
// Measuring and drawing

/** Width in px of a single line at scale 1 (no trailing spacing). */
export function measure(text: string): number {
  const n = normalizeText(text).length;
  return n === 0 ? 0 : n * ADVANCE - 1;
}

/** Horizontal clip window: glyphs entirely outside [x0, x1) are skipped. */
export interface ClipX {
  x0: number;
  x1: number;
}

function drawRaw(ctx: PixelCtx, text: string, x: number, y: number, color: string, scale: number, clip?: ClipX): void {
  ctx.fillStyle = color;
  const adv = ADVANCE * scale;
  const gw = GLYPH_W * scale;
  let cx = Math.round(x);
  const cy = Math.round(y);
  for (let i = 0; i < text.length; i++, cx += adv) {
    if (clip && (cx + gw <= clip.x0 || cx >= clip.x1)) continue;
    const rects = RECTS[text.charCodeAt(i)];
    if (!rects) continue;
    for (let r = 0; r < rects.length; r += 4) {
      ctx.fillRect(cx + rects[r] * scale, cy + rects[r + 1] * scale, rects[r + 2] * scale, rects[r + 3] * scale);
    }
  }
}

/** Draw one line of text at 1x. (x, y) is the top-left of the cell. Returns the drawn width. */
export function drawText(ctx: PixelCtx, text: string, x: number, y: number, color: string, clip?: ClipX): number {
  const t = normalizeText(text);
  drawRaw(ctx, t, x, y, color, 1, clip);
  return t.length === 0 ? 0 : t.length * ADVANCE - 1;
}

/** Draw one line of text with every font pixel scaled to scale x scale. Returns the drawn width. */
export function drawTextScaled(ctx: PixelCtx, text: string, x: number, y: number, color: string, scale: number): number {
  const s = Math.max(1, Math.floor(scale));
  const t = normalizeText(text);
  drawRaw(ctx, t, x, y, color, s);
  return t.length === 0 ? 0 : (t.length * ADVANCE - 1) * s;
}

/**
 * Greedy word wrap to maxWidthPx (at 1x). Words longer than a line are
 * hard-broken. Returns at least one line (possibly "").
 */
export function wrap(text: string, maxWidthPx: number): string[] {
  const maxChars = Math.max(1, Math.floor((maxWidthPx + 1) / ADVANCE));
  const words = normalizeText(text).trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (let word of words) {
    while (word.length > maxChars) {
      const room = cur ? maxChars - cur.length - 1 : maxChars;
      if (room >= 2 && cur) {
        lines.push(`${cur} ${word.slice(0, room)}`);
        word = word.slice(room);
      } else {
        if (cur) lines.push(cur);
        lines.push(word.slice(0, maxChars));
        word = word.slice(maxChars);
      }
      cur = "";
    }
    if (!word) continue;
    if (!cur) cur = word;
    else if (cur.length + 1 + word.length <= maxChars) cur += ` ${word}`;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur || lines.length === 0) lines.push(cur);
  return lines;
}

/** Cut a single line to fit maxWidthPx, ending in "..." when it was shortened. */
export function truncate(text: string, maxWidthPx: number): string {
  const t = normalizeText(text);
  const maxChars = Math.max(1, Math.floor((maxWidthPx + 1) / ADVANCE));
  if (t.length <= maxChars) return t;
  return `${t.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}
