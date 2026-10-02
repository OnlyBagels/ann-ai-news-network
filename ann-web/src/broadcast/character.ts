// The cast at double size (96 px wide), for the 640x360 studio.
//
// The silhouettes come from sprites.ts (hair, head, torso at 48x64), scaled
// 2x, then everything that carries expression is redrawn at the new size:
// eyes with whites and irises that follow the gaze, two-pixel brows, lips,
// teeth and tongue, a shaded nose. Arms are drawn every frame from shoulder
// to hand (two-bone IK), so anchors can gesture, point, hold their notes
// and drink from their mugs. Standing presenters get legs.

import type { AnchorLook } from "./types";
import type { PixelCtx } from "./font";
import { SLOT, baseSlots, lightOf, mix, shadeOf, outlineOf, type Brows, type Lids, type Mouth, type Pose } from "./sprites";

export const CHAR_W = 96;
export const CHAR_H = 128; // bust; legs add LEGS_H below
export const LEGS_H = 72;
/** Rows of the bust from the top down to a desk surface (what shows when seated). */
export const CHAR_DESK_ROW = 114;
/** Rows above this are the head, which nods and tilts on its own. */
const HEAD_SPLIT = 52;
const CX = 48;

// Extra palette slots on top of the 1x ones.
const EYE_WHITE = SLOT.COUNT;
const IRIS = SLOT.COUNT + 1;
const TONGUE = SLOT.COUNT + 2;
const LIP_LO = SLOT.COUNT + 3;
const LENS_HI = SLOT.COUNT + 4;
const POCKET = SLOT.COUNT + 5;
const SLOTS2 = SLOT.COUNT + 6;

class Grid2 {
  readonly d: Uint8Array;
  constructor(readonly w = CHAR_W, readonly h = CHAR_H, src?: Uint8Array) {
    this.d = src ? new Uint8Array(src) : new Uint8Array(w * h);
  }
  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return SLOT.T;
    return this.d[y * this.w + x];
  }
  set(x: number, y: number, v: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.d[y * this.w + x] = v;
  }
  row(y: number, x0: number, x1: number, v: number): void {
    for (let x = x0; x <= x1; x++) this.set(x, y, v);
  }
  rect(x0: number, y0: number, w: number, h: number, v: number): void {
    for (let y = y0; y < y0 + h; y++) this.row(y, x0, x0 + w - 1, v);
  }
  clone(): Grid2 {
    return new Grid2(this.w, this.h, this.d);
  }
}

// ---------------------------------------------------------------------------
// Base: upscale, then add detail the 1x sprite has no room for.

function upscale(src: Uint8Array): Grid2 {
  const g = new Grid2();
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 48; x++) {
      const v = src[y * 48 + x];
      if (v === SLOT.T) continue;
      g.rect(x * 2, y * 2, 2, 2, v);
    }
  }
  return g;
}

function detail(g: Grid2, look: AnchorLook): void {
  const hairSlots = new Set<number>([SLOT.HAIR, SLOT.HAIR_SH]);
  // Hair strands: a diagonal texture of darker and lighter lines.
  for (let y = 0; y < CHAR_H; y++) {
    for (let x = 0; x < CHAR_W; x++) {
      const v = g.get(x, y);
      if (!hairSlots.has(v)) continue;
      if ((x * 2 + y) % 9 === 0) g.set(x, y, v === SLOT.HAIR ? SLOT.HAIR_SH : SLOT.HAIR_OL);
      else if (v === SLOT.HAIR && (x + y * 3) % 13 === 0 && x < CX) g.set(x, y, SLOT.HAIR_HI);
    }
  }
  // Soft outline: where the 1x outline made stair steps, shave the outer corners.
  for (let y = 1; y < CHAR_H - 1; y++) {
    for (let x = 1; x < CHAR_W - 1; x++) {
      const v = g.get(x, y);
      if (v !== SLOT.SKIN_OL && v !== SLOT.HAIR_OL && v !== SLOT.COAT_OL) continue;
      const empty = [g.get(x - 1, y), g.get(x + 1, y), g.get(x, y - 1), g.get(x, y + 1)].filter((n) => n === SLOT.T).length;
      if (empty >= 2 && (x + y) % 2 === 0) g.set(x, y, SLOT.T);
    }
  }
  // Jacket: breast pocket with a pocket square, two buttons, lapel stitching.
  const tie = look.hairStyle === "short" || look.hairStyle === "buzz";
  g.row(80, CX + 18, CX + 28, SLOT.COAT_OL);
  g.rect(CX + 20, 76, 5, 4, POCKET);
  g.set(CX + 22, 75, POCKET);
  g.rect(CX - 2, 90, 3, 3, SLOT.COAT_OL);
  g.rect(CX - 2, 102, 3, 3, SLOT.COAT_OL);
  g.set(CX - 1, 91, SLOT.COAT_HI);
  g.set(CX - 1, 103, SLOT.COAT_HI);
  for (let y = 60; y < 84; y += 3) {
    const off = Math.round(10 - ((y - 54) * 10) / 28);
    if (g.get(CX - off - 6, y) === SLOT.COAT) g.set(CX - off - 6, y, SLOT.COAT_HI);
  }
  if (!tie) {
    // A fine necklace line over the blouse.
    for (let x = CX - 5; x <= CX + 4; x++) if (g.get(x, 58) === SLOT.ACC) g.set(x, 58, SLOT.ACC_SH);
  }
  // Ears: inner shadow.
  for (let y = 30; y <= 36; y++) {
    if (g.get(CX - 17, y) === SLOT.SKIN) g.set(CX - 17, y, SLOT.SKIN_SH);
    if (g.get(CX + 16, y) === SLOT.SKIN) g.set(CX + 16, y, SLOT.SKIN_SH);
  }
  // Jaw: a soft shadow line under the cheek on the shaded side.
  for (let y = 38; y <= 46; y++) {
    const x = CX + 12 - Math.max(0, y - 42);
    if (g.get(x, y) === SKIN_OR(g, x, y)) g.set(x, y, SLOT.SKIN_SH);
  }
}

// Returns the value if it is plain skin, otherwise -1 (so the check fails).
function SKIN_OR(g: Grid2, x: number, y: number): number {
  return g.get(x, y) === SLOT.SKIN ? SLOT.SKIN : -1;
}

// ---------------------------------------------------------------------------
// Face features at 2x

const EYE_L = 38; // left edge of the left eye (4 px wide)
const EYE_R = 54;
const EYE_TOP = 30;

function eye(g: Grid2, x0: number, pose: Pose): void {
  const gx = pose.gazeX;
  const gy = pose.gazeY;
  switch (pose.lids) {
    case "closed":
      g.row(EYE_TOP + 2, x0, x0 + 3, SLOT.EYE);
      g.set(x0 - 1, EYE_TOP + 1, SLOT.EYE);
      g.set(x0 + 4, EYE_TOP + 1, SLOT.EYE);
      return;
    case "happy":
      g.row(EYE_TOP, x0 + 1, x0 + 2, SLOT.EYE);
      g.set(x0, EYE_TOP + 1, SLOT.EYE);
      g.set(x0 + 3, EYE_TOP + 1, SLOT.EYE);
      g.set(x0 - 1, EYE_TOP + 2, SLOT.EYE);
      g.set(x0 + 4, EYE_TOP + 2, SLOT.EYE);
      return;
    default: {
      const wide = pose.lids === "wide";
      const top = wide ? EYE_TOP - 1 : EYE_TOP;
      const bottom = wide ? EYE_TOP + 4 : EYE_TOP + 3;
      g.rect(x0, top, 4, bottom - top + 1, EYE_WHITE);
      // Iris 2x3 (2x2 when wide-eyed shows more white), following the gaze.
      const ix = x0 + 1 + gx;
      const iy = (wide ? EYE_TOP + 1 : EYE_TOP + 1) + gy;
      for (let y = iy; y < iy + 3; y++) {
        if (y < top || y > bottom) continue;
        g.row(y, ix, ix + 1, IRIS);
      }
      if (iy >= top) g.set(ix, iy, SLOT.EYE_HI);
      // Lash line along the top, heavier at the outer corner.
      g.row(top - 1, x0, x0 + 3, SLOT.EYE);
      if (x0 < CX) g.set(x0 - 1, top, SLOT.EYE);
      else g.set(x0 + 4, top, SLOT.EYE);
      if (pose.lids === "half") {
        g.row(top, x0, x0 + 3, SLOT.SKIN_SH);
        g.row(top + 1, x0, x0 + 3, SLOT.EYE);
      }
    }
  }
}

function brow(g: Grid2, x0: number, inner: number, mid: number, outer: number, leftSide: boolean): void {
  // Three 2-px segments, each two rows thick.
  const ys = leftSide ? [outer, mid, inner] : [inner, mid, outer];
  ys.forEach((y, i) => g.rect(x0 + i * 2, y, 2, 2, SLOT.BROW));
}

function brows(g: Grid2, b: Brows, dx: number): void {
  const L = 36 + dx;
  const R = 54 + dx;
  switch (b) {
    case "raised":
      brow(g, L, 22, 22, 23, true);
      brow(g, R, 22, 22, 23, false);
      break;
    case "furrowed":
      brow(g, L, 27, 26, 25, true);
      brow(g, R, 27, 26, 25, false);
      break;
    case "sad":
      brow(g, L, 23, 24, 26, true);
      brow(g, R, 23, 24, 26, false);
      break;
    case "skeptical":
      brow(g, L, 23, 22, 23, true);
      brow(g, R, 26, 26, 25, false);
      break;
    default:
      brow(g, L, 25, 25, 26, true);
      brow(g, R, 25, 25, 26, false);
  }
}

function mouth(g: Grid2, m: Mouth, dx: number): void {
  const c = 48 + dx; // mouth centre falls between columns c-1 and c
  const span = (y: number, half: number, v: number) => g.row(y, c - half, c + half - 1, v);
  switch (m) {
    case "half":
      span(41, 4, SLOT.LIP);
      span(42, 3, SLOT.MOUTH);
      span(43, 2, LIP_LO);
      break;
    case "open":
      span(40, 3, SLOT.LIP);
      span(41, 4, SLOT.MOUTH);
      span(42, 4, SLOT.MOUTH);
      span(43, 3, SLOT.MOUTH);
      span(43, 2, TONGUE);
      span(44, 3, LIP_LO);
      break;
    case "wide":
      span(40, 5, SLOT.LIP);
      span(41, 5, SLOT.TEETH);
      span(42, 4, SLOT.MOUTH);
      span(43, 3, LIP_LO);
      break;
    case "round":
      span(40, 2, SLOT.LIP);
      for (const y of [41, 42, 43]) {
        g.set(c - 3, y, SLOT.LIP);
        span(y, 2, SLOT.MOUTH);
        g.set(c + 2, y, SLOT.LIP);
      }
      span(44, 2, LIP_LO);
      break;
    case "smile":
      span(42, 3, SLOT.LIP);
      g.row(41, c - 5, c - 4, SLOT.LIP);
      g.row(41, c + 3, c + 4, SLOT.LIP);
      span(43, 2, LIP_LO);
      break;
    case "frown":
      span(42, 3, SLOT.LIP);
      g.row(43, c - 5, c - 4, SLOT.LIP);
      g.row(43, c + 3, c + 4, SLOT.LIP);
      break;
    case "smirk":
      g.row(42, c - 4, c + 2, SLOT.LIP);
      g.row(41, c + 3, c + 4, SLOT.LIP);
      span(43, 1, LIP_LO);
      break;
    case "laugh":
      g.set(c - 6, 40, SLOT.LIP);
      g.set(c + 5, 40, SLOT.LIP);
      span(40, 5, SLOT.TEETH);
      span(41, 5, SLOT.MOUTH);
      span(42, 4, SLOT.MOUTH);
      span(42, 2, TONGUE);
      span(43, 3, LIP_LO);
      break;
    case "grin":
      g.row(41, c - 6, c - 5, SLOT.LIP);
      g.row(41, c + 4, c + 5, SLOT.LIP);
      span(42, 4, SLOT.TEETH);
      span(43, 3, SLOT.MOUTH);
      span(44, 2, LIP_LO);
      break;
    default:
      span(42, 4, SLOT.LIP);
      span(43, 2, LIP_LO);
  }
}

function features(g: Grid2, look: AnchorLook, pose: Pose): void {
  const dx = pose.turn * 2;
  brows(g, pose.brows, dx);
  const p = look.glasses ? { ...pose, gazeY: 0 as const } : pose;
  eye(g, EYE_L + dx, p);
  eye(g, EYE_R + dx, p);
  // Cheeks
  const cy = pose.blush ? 35 : 37;
  g.rect(31 + dx, cy, 4, 2, SLOT.BLUSH);
  g.rect(61 + dx, cy, 4, 2, SLOT.BLUSH);
  // Nose: a shadow down the shaded side, nostrils, a lit tip.
  g.set(48 + dx, 34, SLOT.SKIN_SH);
  g.set(48 + dx, 35, SLOT.SKIN_SH);
  g.set(49 + dx, 36, SLOT.SKIN_SH);
  g.row(38, 46 + dx, 47 + dx, SLOT.SKIN_SH);
  g.row(38, 49 + dx, 50 + dx, SLOT.SKIN_SH);
  g.set(47 + dx, 37, SLOT.SKIN_HI);
  mouth(g, pose.mouth, dx);
  if (look.glasses) {
    for (const x0 of [EYE_L + dx, EYE_R + dx]) {
      const l = x0 - 3;
      const r = x0 + 6;
      g.row(27, l, r, SLOT.GLASS);
      g.row(35, l, r, SLOT.GLASS);
      for (let y = 28; y <= 34; y++) {
        g.set(l, y, SLOT.GLASS);
        g.set(r, y, SLOT.GLASS);
      }
      g.set(l + 1, 28, LENS_HI);
      g.set(l + 2, 28, LENS_HI);
      g.set(l + 1, 29, LENS_HI);
    }
    g.row(30, EYE_L + dx + 7, EYE_R + dx - 4, SLOT.GLASS); // bridge
    g.row(30, 30 + dx, EYE_L + dx - 4, SLOT.GLASS); // temples
    g.row(30, EYE_R + dx + 7, 65 + dx, SLOT.GLASS);
  }
}

// ---------------------------------------------------------------------------
// Palette, compile, cache

interface Compiled {
  colors: string[];
  runs: Int16Array[];
}

function compile(g: Grid2, palette: string[]): Compiled {
  const byColor = new Map<string, number[]>();
  for (let y = 0; y < g.h; y++) {
    let x = 0;
    while (x < g.w) {
      const v = g.get(x, y);
      if (v === SLOT.T) {
        x++;
        continue;
      }
      const x0 = x;
      while (x < g.w && g.get(x, y) === v) x++;
      const color = palette[v];
      let list = byColor.get(color);
      if (!list) byColor.set(color, (list = []));
      const n = list.length;
      if (n >= 4 && y !== HEAD_SPLIT && list[n - 4] === x0 && list[n - 2] === x - x0 && list[n - 3] + list[n - 1] === y) list[n - 1]++;
      else list.push(x0, y, x - x0, 1);
    }
  }
  return { colors: [...byColor.keys()], runs: [...byColor.values()].map((l) => Int16Array.from(l)) };
}

interface CharacterSprites {
  base: Grid2;
  palette: string[];
  variants: Map<string, Compiled>;
}

const cache = new Map<string, CharacterSprites>();

function lookKey(look: AnchorLook): string {
  return [look.skin, look.hair, look.hairStyle, look.outfit, look.accent, look.glasses ? 1 : 0].join("|");
}

function getCharacter(look: AnchorLook): CharacterSprites {
  const key = lookKey(look);
  let c = cache.get(key);
  if (!c) {
    const { data, palette } = baseSlots(look);
    const base = upscale(data);
    detail(base, look);
    const p = palette.slice();
    while (p.length < SLOTS2) p.push("#ff00ff");
    p[EYE_WHITE] = mix("#f6f2ea", look.skin, 0.12);
    p[IRIS] = mix("#3a2418", look.hair, 0.25);
    p[TONGUE] = "#c75a68";
    p[LIP_LO] = mix(look.skin, "#8a3a44", 0.3);
    p[LENS_HI] = "#e8f2ff";
    p[POCKET] = look.accent;
    c = { base, palette: p, variants: new Map() };
    cache.set(key, c);
  }
  return c;
}

export function palette(look: AnchorLook): string[] {
  return getCharacter(look).palette;
}

function poseKey(p: Pose, standing: boolean): string {
  return `${p.mouth}|${p.lids}|${p.brows}|${p.gazeX}|${p.gazeY}|${p.turn}|${p.blush ? 1 : 0}|${standing ? 1 : 0}`;
}

/** Standing, the jacket narrows to a waist instead of spreading over a desk. */
function taper(g: Grid2): void {
  for (let y = 92; y < CHAR_H; y++) {
    const hw = Math.round(42 - ((y - 92) / (CHAR_H - 92)) * 18);
    for (let x = 0; x < CHAR_W; x++) {
      const d = x < CX ? CX - 1 - x : x - CX;
      if (d > hw) g.set(x, y, SLOT.T);
      else if (d === hw && g.get(x, y) !== SLOT.T) g.set(x, y, SLOT.COAT_OL);
    }
  }
}

function variant(look: AnchorLook, pose: Pose, standing = false): Compiled {
  const c = getCharacter(look);
  const key = poseKey(pose, standing);
  let v = c.variants.get(key);
  if (!v) {
    const g = c.base.clone();
    if (standing) taper(g);
    features(g, look, pose);
    v = compile(g, c.palette);
    c.variants.set(key, v);
  }
  return v;
}

/** Draw the bust. Rows at or below maxRow are skipped. Head rows move by `head`. */
export function drawBust(
  ctx: PixelCtx,
  look: AnchorLook,
  pose: Pose,
  x: number,
  y: number,
  maxRow = CHAR_H,
  head: { dx: number; dy: number } = { dx: 0, dy: 0 },
  standing = false,
): void {
  const s = variant(look, pose, standing);
  x = Math.round(x);
  y = Math.round(y);
  const moved = head.dx !== 0 || head.dy !== 0;
  for (const pass of moved ? [0, 1] : [0]) {
    for (let i = 0; i < s.colors.length; i++) {
      ctx.fillStyle = s.colors[i];
      const r = s.runs[i];
      for (let j = 0; j < r.length; j += 4) {
        const ry = r[j + 1];
        if (ry >= maxRow) continue;
        const isHead = moved && ry < HEAD_SPLIT;
        if (moved && (pass === 0) === isHead) continue;
        const h = Math.min(r[j + 3], maxRow - ry);
        if (isHead) ctx.fillRect(x + r[j] + head.dx, y + ry + head.dy, r[j + 2], h);
        else ctx.fillRect(x + r[j], y + ry, r[j + 2], h);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Legs (standing presenters)

/** Trousers and shoes under a standing bust whose top-left is (x, y). `shift` sways the weight -1..1. */
export function drawLegs(ctx: PixelCtx, look: AnchorLook, x: number, y: number, shift = 0): void {
  const pal = palette(look);
  const trouser = shadeOf(look.outfit, 0.45);
  const trouserSh = shadeOf(look.outfit, 0.62);
  const out = outlineOf(look.outfit);
  const top = y + CHAR_H - 2;
  const legs: [number, number][] = [
    [x + CX - 18, 0],
    [x + CX + 2, 1],
  ];
  for (const [lx, side] of legs) {
    const bend = side === 0 ? Math.max(0, -shift) : Math.max(0, shift);
    ctx.fillStyle = out;
    ctx.fillRect(lx - 1, top, 18, LEGS_H - 8);
    ctx.fillStyle = trouser;
    ctx.fillRect(lx, top, 16, LEGS_H - 9);
    ctx.fillStyle = trouserSh;
    ctx.fillRect(lx + (side === 0 ? 11 : 0), top, 5, LEGS_H - 9);
    // Crease
    ctx.fillRect(lx + 8, top + 6 + bend, 1, LEGS_H - 20);
    // Shoe
    ctx.fillStyle = "#16121c";
    ctx.fillRect(lx - 2 + (side === 0 ? -3 : 1), top + LEGS_H - 10, 21, 7);
    ctx.fillStyle = "#3b3346";
    ctx.fillRect(lx + (side === 0 ? -3 : 3), top + LEGS_H - 10, 8, 1);
  }
  // Belt line under the jacket hem.
  ctx.fillStyle = pal[SLOT.COAT_OL];
  ctx.fillRect(x + CX - 20, top, 40, 2);
}

// ---------------------------------------------------------------------------
// Arms

export type HandShape = "open" | "fist" | "point" | "grip" | "flat" | "thumb";

export interface Arm {
  /** Hand position in the character's own coordinates (top-left of the bust). */
  hx: number;
  hy: number;
  shape: HandShape;
  /** Which way the pointing finger goes. */
  pointDir?: -1 | 1;
}

const SHOULDER_Y = 64;
const SHOULDER_DX = 30;
const UPPER = 30;
const FORE = 30;

/** Elbow position for a two-bone arm, bent outward and down. */
function elbow(sx: number, sy: number, hx: number, hy: number, side: -1 | 1): [number, number] {
  const dx = hx - sx;
  const dy = hy - sy;
  let d = Math.hypot(dx, dy);
  const max = UPPER + FORE - 0.5;
  if (d > max) d = max;
  if (d < 1) return [sx + side * UPPER * 0.6, sy + UPPER * 0.8];
  const a = Math.acos(Math.max(-1, Math.min(1, (UPPER * UPPER + d * d - FORE * FORE) / (2 * UPPER * d))));
  const base = Math.atan2(dy, dx);
  // Two solutions; take the one with the elbow further out to the side.
  const e1: [number, number] = [sx + Math.cos(base + a) * UPPER, sy + Math.sin(base + a) * UPPER];
  const e2: [number, number] = [sx + Math.cos(base - a) * UPPER, sy + Math.sin(base - a) * UPPER];
  const score = (e: [number, number]) => (e[1] - sy) + (e[0] - sx) * side * 0.5;
  return score(e1) >= score(e2) ? e1 : e2;
}

/** A thick segment: outline, shadow body, lit face. */
function limb(ctx: PixelCtx, ax: number, ay: number, bx: number, by: number, w: number, fill: string, shade: string, out: string): void {
  const len = Math.max(1, Math.hypot(bx - ax, by - ay));
  const steps = Math.ceil(len * 1.5);
  const passes: [string, number, number][] = [
    [out, w + 2, 0],
    [shade, w, 0],
    [fill, w - 3, -1],
  ];
  for (const [color, size, off] of passes) {
    ctx.fillStyle = color;
    const h = Math.floor(size / 2);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = Math.round(ax + (bx - ax) * t) + off;
      const py = Math.round(ay + (by - ay) * t) + off;
      ctx.fillRect(px - h, py - h, size, size);
    }
  }
}

const HANDS: Record<HandShape, string[]> = {
  open: [
    ".o.o.o.o..",
    "osososos..",
    "osososos..",
    "osSsSsSso.",
    "ossssssoso",
    "osssssssso",
    "ossssssso.",
    ".osssssso.",
    "..ooooo...",
  ],
  fist: [
    ".oooooo.",
    "osSsSsSo",
    "osssssso",
    "oSsSsSso",
    "osssssso",
    ".osssso.",
    "..oooo..",
  ],
  point: [
    ".oooooo.........",
    "osSsSssoooooooo.",
    "osssssssssssssso",
    "oSsSsssoooooooo.",
    "osssssso........",
    ".osssso.........",
    "..oooo..........",
  ],
  grip: [
    ".ooooo.",
    "osssSso",
    "osssSso",
    "osssSso",
    ".ooooo.",
  ],
  flat: [
    ".ooooooooo.",
    "ossSssSsssso",
    "ossssssssssso",
    ".ooooooooooo.",
  ],
  thumb: [
    "..oo....",
    ".osso...",
    ".osso...",
    "ossSooo.",
    "ossssSso",
    "osssssso",
    "oSssssso",
    ".oooooo.",
  ],
};

function drawHandShape(ctx: PixelCtx, look: AnchorLook, shape: HandShape, cx: number, cy: number, mirror: boolean): void {
  const pal = palette(look);
  const colors: Record<string, string> = { o: pal[SLOT.SKIN_OL], s: pal[SLOT.SKIN], S: pal[SLOT.SKIN_SH] };
  const rows = HANDS[shape];
  const w = Math.max(...rows.map((r) => r.length));
  const x0 = Math.round(cx - (mirror ? w - 4 : 4));
  const y0 = Math.round(cy - Math.floor(rows.length / 2));
  rows.forEach((row, dy) => {
    for (let i = 0; i < row.length; i++) {
      const c = colors[row[i]];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(mirror ? x0 + (w - 1 - i) : x0 + i, y0 + dy, 1, 1);
    }
  });
}

/**
 * Draw one arm, shoulder to hand, for a character whose bust top-left is
 * (x, y). side -1 is the character's right (screen left), 1 its left.
 */
export function drawArm(ctx: PixelCtx, look: AnchorLook, x: number, y: number, side: -1 | 1, arm: Arm): void {
  const pal = palette(look);
  const sx = x + CX + side * SHOULDER_DX;
  const sy = y + SHOULDER_Y;
  const hx = x + arm.hx;
  const hy = y + arm.hy;
  const [ex, ey] = elbow(sx, sy, hx, hy, side);
  limb(ctx, sx, sy, ex, ey, 14, pal[SLOT.COAT], pal[SLOT.COAT_SH], pal[SLOT.COAT_OL]);
  // Forearm stops short of the hand for the shirt cuff.
  const fx = hx + (ex - hx) * 0.18;
  const fy = hy + (ey - hy) * 0.18;
  limb(ctx, ex, ey, fx, fy, 12, pal[SLOT.COAT], pal[SLOT.COAT_SH], pal[SLOT.COAT_OL]);
  ctx.fillStyle = pal[SLOT.SHIRT];
  ctx.fillRect(Math.round(fx) - 3, Math.round(fy) - 3, 6, 6);
  const mirror = arm.shape === "point" ? (arm.pointDir ?? side) < 0 : side > 0;
  drawHandShape(ctx, look, arm.shape, hx, hy, mirror);
}

/** Where a character's hands rest: on a desk, or hanging at their sides when standing. */
export function restArm(side: -1 | 1, standing: boolean): Arm {
  return standing
    ? { hx: CX + side * 34, hy: 122, shape: "fist" }
    : { hx: CX + side * 22, hy: CHAR_DESK_ROW + 4, shape: "flat" };
}

// ---------------------------------------------------------------------------
// Props

/** A desk mug at (x, y) = its top-left, in the given colour. tilt lifts the rim when drinking. */
export function drawMug(ctx: PixelCtx, x: number, y: number, color: string, nowMs: number, steam: boolean): void {
  x = Math.round(x);
  y = Math.round(y);
  const out = outlineOf(color);
  ctx.fillStyle = out;
  ctx.fillRect(x - 1, y - 1, 12, 15);
  ctx.fillRect(x + 10, y + 2, 5, 8);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 10, 13);
  ctx.fillStyle = shadeOf(color, 0.3);
  ctx.fillRect(x + 7, y, 3, 13);
  ctx.fillStyle = lightOf(color, 0.35);
  ctx.fillRect(x + 1, y + 1, 2, 10);
  // Handle
  ctx.fillStyle = color;
  ctx.fillRect(x + 11, y + 3, 2, 6);
  ctx.fillStyle = out;
  ctx.fillRect(x + 11, y + 5, 2, 2);
  // Coffee
  ctx.fillStyle = "#3a2216";
  ctx.fillRect(x + 1, y, 8, 1);
  if (steam) {
    // Three wisps, drifting up and side to side.
    ctx.fillStyle = "rgba(245,240,234,0.55)";
    for (let k = 0; k < 3; k++) {
      const t = ((nowMs / 90 + k * 7) % 18) | 0;
      const sx = x + 2 + k * 3 + (Math.floor((nowMs / 260 + k) % 3) - 1);
      ctx.fillRect(sx, y - 3 - t, 1, 2);
    }
  }
}

/** A stack of notes lying on the desk. */
export function drawNotes(ctx: PixelCtx, x: number, y: number): void {
  x = Math.round(x);
  y = Math.round(y);
  ctx.fillStyle = "#bdb6aa";
  ctx.fillRect(x + 2, y + 1, 30, 7);
  ctx.fillStyle = "#e9e3d8";
  ctx.fillRect(x, y, 30, 6);
  ctx.fillStyle = "#a59e92";
  for (let i = 0; i < 4; i++) ctx.fillRect(x + 3, y + 1 + i, 18 - (i % 2) * 6, 1);
}

/** A sheet held up in both hands, read from. (x, y) is the top-left. */
export function drawHeldSheet(ctx: PixelCtx, x: number, y: number, nowMs: number): void {
  x = Math.round(x);
  y = Math.round(y + (Math.floor(nowMs / 700) % 2));
  ctx.fillStyle = "#4a443c";
  ctx.fillRect(x - 1, y - 1, 30, 36);
  ctx.fillStyle = "#f2ece2";
  ctx.fillRect(x, y, 28, 34);
  ctx.fillStyle = "#d9d2c5";
  ctx.fillRect(x + 22, y, 6, 34);
  ctx.fillStyle = "#9a9387";
  for (let i = 0; i < 9; i++) ctx.fillRect(x + 3, y + 4 + i * 3, i % 3 === 2 ? 12 : 20, 1);
}

/** A desk microphone on a short stand (late-night set). */
export function drawDeskMic(ctx: PixelCtx, x: number, y: number): void {
  ctx.fillStyle = "#1c1822";
  ctx.fillRect(x + 3, y + 6, 2, 12);
  ctx.fillRect(x - 1, y + 17, 10, 3);
  ctx.fillStyle = "#57505f";
  ctx.fillRect(x, y, 8, 7);
  ctx.fillStyle = "#8a8294";
  ctx.fillRect(x + 1, y + 1, 2, 4);
}
