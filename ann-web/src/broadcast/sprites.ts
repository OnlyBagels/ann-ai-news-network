// Procedural pixel-art anchors, built from an AnchorLook.
//
// Each anchor is composed once on a 48x64 grid (back hair, torso, neck, face,
// front hair), outlined and shaded, then each pose variant (mouth x blink x
// head turn) is compiled to colour-grouped horizontal runs. Drawing a frame
// is a few hundred fillRect calls with integer coordinates.

import type { AnchorLook } from "./types";
import type { PixelCtx } from "./font";

// ---------------------------------------------------------------------------
// Colour helpers (shared with scene.ts)

type RGB = [number, number, number];

function parseHex(hex: string): RGB {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  if (!Number.isFinite(n)) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: RGB): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Linear mix of two hex colours; t=0 gives a, t=1 gives b. */
export function mix(a: string, b: string, t: number): string {
  const A = parseHex(a);
  const B = parseHex(b);
  return toHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}

/** Relative luminance 0..1 (sRGB, approximate). */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Shadows lean cool, highlights lean warm.
const SHADOW_TINT = "#2a1d3d";
const OUTLINE_TINT = "#120c18";
const LIGHT_TINT = "#fff3d6";

export const shadeOf = (c: string, t = 0.32) => mix(c, SHADOW_TINT, t);
export const outlineOf = (c: string) => mix(c, OUTLINE_TINT, 0.62);
export const lightOf = (c: string, t = 0.22) => mix(c, LIGHT_TINT, t);

// ---------------------------------------------------------------------------
// Sprite grid

export const SPRITE_W = 48;
export const SPRITE_H = 64;
/** Sprite rows from the top down to the desk surface (what is visible when seated). */
export const SPRITE_DESK_ROW = 57;
/** Rows above this belong to the head, which can nod and bob on its own. */
const HEAD_SPLIT = 26;
const CX = 24; // symmetry axis sits between columns 23 and 24

// Palette slots
const T = 0;
const SKIN = 1, SKIN_SH = 2, SKIN_HI = 3, SKIN_OL = 4;
const HAIR = 5, HAIR_SH = 6, HAIR_HI = 7, HAIR_OL = 8;
const COAT = 9, COAT_SH = 10, COAT_HI = 11, COAT_OL = 12;
const ACC = 13, ACC_SH = 14, ACC_OL = 15;
const SHIRT = 16, SHIRT_SH = 17;
const EYE = 18, EYE_HI = 19, MOUTH = 20, LIP = 21, BLUSH = 22, BROW = 23, GLASS = 24;
const BUZZ = 25;
const TEETH = 26;
const SLOTS = 27;

type Group = "skin" | "hair" | "coat" | "acc" | "shirt" | "none";
const GROUP: Group[] = [];
for (let i = 0; i < SLOTS; i++) GROUP.push("none");
[SKIN, SKIN_SH, SKIN_HI, SKIN_OL].forEach((s) => (GROUP[s] = "skin"));
[HAIR, HAIR_SH, HAIR_HI, HAIR_OL, BUZZ].forEach((s) => (GROUP[s] = "hair"));
[COAT, COAT_SH, COAT_HI, COAT_OL].forEach((s) => (GROUP[s] = "coat"));
[ACC, ACC_SH, ACC_OL].forEach((s) => (GROUP[s] = "acc"));
[SHIRT, SHIRT_SH].forEach((s) => (GROUP[s] = "shirt"));

class Grid {
  readonly d = new Uint8Array(SPRITE_W * SPRITE_H);
  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= SPRITE_W || y >= SPRITE_H) return T;
    return this.d[y * SPRITE_W + x];
  }
  set(x: number, y: number, v: number): void {
    if (x < 0 || y < 0 || x >= SPRITE_W || y >= SPRITE_H) return;
    this.d[y * SPRITE_W + x] = v;
  }
  /** Fill columns [x0, x1] on row y. */
  row(y: number, x0: number, x1: number, v: number): void {
    for (let x = x0; x <= x1; x++) this.set(x, y, v);
  }
  /** Symmetric span: half-width hw around the axis. */
  span(y: number, hw: number, v: number): void {
    if (hw > 0) this.row(y, CX - hw, CX + hw - 1, v);
  }
  /** Mirror a single pixel across the axis as well. */
  sym(x: number, y: number, v: number): void {
    this.set(x, y, v);
    this.set(2 * CX - 1 - x, y, v);
  }
  clone(): Grid {
    const g = new Grid();
    g.d.set(this.d);
    return g;
  }
}

// Face half-widths for rows 7..24.
const FACE_TOP = 7;
const FACE_HW = [6, 7, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 7, 7, 6, 5, 4];
const faceHw = (y: number) => FACE_HW[y - FACE_TOP] ?? 0;

// Torso half-widths from row 27 down.
const TORSO_TOP = 27;
const TORSO_HW = [10, 14, 17, 19, 20, 21, 21];
const torsoHw = (y: number) => (y < TORSO_TOP ? 0 : TORSO_HW[y - TORSO_TOP] ?? 22);

/** Half-width of the open V of the jacket (shirt/blouse showing). */
const vHw = (y: number) => (y < 26 ? 0 : Math.max(0, Math.round(5 - ((y - 27) * 5) / 14)));

type HairStyle = AnchorLook["hairStyle"];

function drawBackHair(g: Grid, style: HairStyle): void {
  if (style === "bob") {
    for (let y = 16; y <= 25; y++) g.span(y, y >= 24 ? 9 : 10, HAIR_SH);
  } else if (style === "long") {
    for (let y = 14; y <= 40; y++) g.span(y, 11, HAIR_SH);
  }
}

function drawTorso(g: Grid, look: AnchorLook): void {
  const tie = look.hairStyle === "short" || look.hairStyle === "buzz";
  for (let y = TORSO_TOP; y < SPRITE_H; y++) g.span(y, torsoHw(y), COAT);
  // Open V: blouse in the accent colour, or a shirt with a tie in the accent colour.
  for (let y = 26; y <= 41; y++) g.span(y, vHw(y), tie ? SHIRT : ACC);
  if (tie) {
    // Collar points
    g.sym(19, 27, SHIRT);
    g.sym(20, 27, SHIRT);
    g.sym(20, 28, SHIRT);
    g.sym(21, 29, SHIRT_SH);
    // Knot and blade
    g.row(27, 22, 25, ACC);
    g.row(28, 22, 25, ACC);
    g.row(29, 23, 24, ACC_SH);
    for (let y = 30; y <= 41; y++) {
      const hw = y < 34 ? 1 : 2;
      g.span(y, hw, ACC);
      g.set(CX + hw - 1, y, ACC_SH);
    }
  } else {
    // Soft blouse neckline: shade the inner edge next to the neck.
    for (let y = 27; y <= 29; y++) {
      g.set(CX - vHw(y), y, ACC_SH);
      g.set(CX + vHw(y) - 1, y, ACC_SH);
    }
  }
  // Lapels: dark edge along the V, a fold line three pixels out.
  for (let y = 27; y <= 42; y++) {
    const hw = vHw(y);
    const l = CX - hw - 1;
    const r = CX + hw;
    if (g.get(l, y) === COAT) g.set(l, y, COAT_OL);
    if (g.get(r, y) === COAT) g.set(r, y, COAT_OL);
    if (y >= 30 && y <= 40) {
      if (g.get(l - 3, y) === COAT) g.set(l - 3, y, COAT_SH);
      if (g.get(r + 3, y) === COAT) g.set(r + 3, y, COAT_SH);
    }
  }
  // Button
  g.set(CX - 1, 45, COAT_OL);
  // Arms resting forward: sleeve seams.
  for (let y = 38; y < SPRITE_H; y++) {
    g.set(CX - 16, y, COAT_SH);
    g.set(CX + 15, y, COAT_SH);
  }
  // Light from the upper left: right flank in shadow, top of the left shoulder lit.
  for (let y = TORSO_TOP; y < SPRITE_H; y++) {
    for (let x = CX + 13; x < SPRITE_W; x++) if (g.get(x, y) === COAT) g.set(x, y, COAT_SH);
    for (let x = 0; x < CX - 4; x++) {
      if (g.get(x, y) === COAT && (g.get(x, y - 1) === T || g.get(x, y - 2) === T)) g.set(x, y, COAT_HI);
    }
  }
}

function drawHead(g: Grid): void {
  // Neck
  for (let y = 23; y <= 28; y++) g.span(y, 4, SKIN);
  g.span(25, 4, SKIN_SH);
  for (let y = 25; y <= 28; y++) g.set(CX + 3, y, SKIN_SH);
  // Face
  for (let y = FACE_TOP; y < FACE_TOP + FACE_HW.length; y++) {
    const hw = faceHw(y);
    g.span(y, hw, SKIN);
    g.set(CX + hw - 1, y, SKIN_SH);
    if (hw >= 7) g.set(CX + hw - 2, y, y > 20 ? SKIN_SH : SKIN);
  }
  g.span(24, 4, SKIN_SH);
  g.row(23, CX + 2, CX + 4, SKIN_SH);
  // Ears
  for (let y = 14; y <= 18; y++) {
    g.sym(CX - 9, y, SKIN);
  }
  for (let y = 15; y <= 17; y++) {
    g.set(CX - 9, y, SKIN_SH);
    g.set(CX + 8, y, SKIN_SH);
  }
  // Skull under the hair line
  for (let y = 3; y < FACE_TOP; y++) g.span(y, Math.min(8, 3 + (y - 3) * 2), SKIN);
}

/** Cover the face down to bottom[col - (CX-8)] for the 16 face columns. */
function fringe(g: Grid, bottom: number[], top: number, v = HAIR): void {
  for (let i = 0; i < 16; i++) {
    const x = CX - 8 + i;
    for (let y = top; y <= bottom[i]; y++) g.set(x, y, v);
  }
}

function drawFrontHair(g: Grid, style: HairStyle): void {
  if (style === "short") {
    const cap: [number, number][] = [[2, 5], [3, 7], [4, 8], [5, 9], [6, 9], [7, 9], [8, 9], [9, 9]];
    for (const [y, hw] of cap) g.span(y, hw, HAIR);
    g.row(1, CX - 3, CX + 3, HAIR); // a bit of lift on top
    g.row(0, CX, CX + 2, HAIR);
    fringe(g, [12, 11, 10, 10, 9, 9, 10, 10, 10, 10, 11, 11, 11, 11, 12, 12], 7);
    // Sideburns above the ears
    for (let y = 10; y <= 13; y++) {
      g.set(CX - 9, y, HAIR);
      g.set(CX - 8, y, HAIR);
      g.set(CX + 7, y, HAIR);
      g.set(CX + 8, y, HAIR);
    }
    // Part and shine
    for (let y = 3; y <= 8; y++) g.set(CX - 5, y, HAIR_SH);
    g.row(3, CX - 4, CX - 1, HAIR_HI);
    g.row(4, CX - 3, CX + 1, HAIR_HI);
    g.row(2, CX + 1, CX + 3, HAIR_HI);
    shadeHairRight(g, CX + 6);
  } else if (style === "buzz") {
    const cap: [number, number][] = [[3, 5], [4, 7], [5, 8], [6, 9], [7, 9], [8, 9]];
    for (const [y, hw] of cap) g.span(y, hw, HAIR);
    fringe(g, [10, 10, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 10, 10], 7);
    for (let y = 9; y <= 12; y++) {
      g.set(CX - 9, y, HAIR);
      g.set(CX + 8, y, HAIR);
    }
    // Close-cropped: scalp shows through along the hairline.
    for (let y = 3; y <= 12; y++) {
      for (let x = 0; x < SPRITE_W; x++) {
        if (g.get(x, y) !== HAIR) continue;
        const edge = g.get(x, y + 1) === SKIN || g.get(x, y + 1) === SKIN_SH;
        if (edge && (x + y) % 2 === 0) g.set(x, y, BUZZ);
      }
    }
    g.row(4, CX - 4, CX - 1, HAIR_HI);
    g.row(5, CX - 6, CX - 4, HAIR_HI);
    shadeHairRight(g, CX + 6);
  } else if (style === "bob") {
    const cap: [number, number][] = [[1, 6], [2, 9], [3, 10], [4, 11], [5, 11], [6, 11], [7, 11], [8, 11]];
    for (const [y, hw] of cap) g.span(y, hw, HAIR);
    // Sides framing the face down to the jaw, curling under.
    for (let y = 9; y <= 24; y++) {
      const inner = Math.max(faceHw(y) - 1, 0);
      const outer = y >= 23 ? 10 : 11;
      g.row(y, CX - outer, CX - 1 - inner, HAIR);
      g.row(y, CX + inner, CX + outer - 1, HAIR);
    }
    g.row(25, CX - 9, CX - 6, HAIR);
    g.row(25, CX + 5, CX + 8, HAIR);
    fringe(g, [12, 12, 11, 11, 10, 10, 10, 10, 10, 10, 10, 11, 11, 11, 12, 12], 7);
    g.row(3, CX - 6, CX - 1, HAIR_HI);
    g.row(4, CX - 8, CX - 5, HAIR_HI);
    for (let y = 10; y <= 19; y++) g.set(CX - 10, y, HAIR_HI);
    shadeHairRight(g, CX + 8);
  } else {
    // long, centre part
    const cap: [number, number][] = [[1, 6], [2, 9], [3, 10], [4, 10], [5, 10], [6, 10], [7, 10], [8, 10]];
    for (const [y, hw] of cap) g.span(y, hw, HAIR);
    for (let y = 9; y <= 26; y++) {
      const inner = Math.max(faceHw(y) - 1, 0);
      g.row(y, CX - 10, CX - 1 - inner, HAIR);
      g.row(y, CX + inner, CX + 9, HAIR);
    }
    // Locks falling over the shoulders, tapering at the ends.
    for (let y = 27; y <= 44; y++) {
      const taper = y >= 42 ? 1 : 0;
      g.row(y, CX - 11 + taper, CX - 7 - taper, HAIR);
      g.row(y, CX + 6 + taper, CX + 10 - taper, HAIR);
    }
    fringe(g, [13, 12, 11, 10, 9, 9, 8, 7, 7, 8, 9, 9, 10, 11, 12, 13], 7);
    for (let y = 2; y <= 6; y++) g.set(CX - 1, y, HAIR_SH);
    g.row(3, CX - 7, CX - 3, HAIR_HI);
    g.row(3, CX + 2, CX + 5, HAIR_HI);
    for (let y = 11; y <= 36; y++) g.set(CX - 10, y, HAIR_HI);
    shadeHairRight(g, CX + 7);
  }
}

function shadeHairRight(g: Grid, fromX: number): void {
  for (let y = 0; y < SPRITE_H; y++) {
    for (let x = fromX; x < SPRITE_W; x++) if (g.get(x, y) === HAIR) g.set(x, y, HAIR_SH);
  }
}

const OUTLINE_SLOT: Record<Group, number> = {
  skin: SKIN_OL,
  hair: HAIR_OL,
  coat: COAT_OL,
  acc: ACC_OL,
  shirt: COAT_OL,
  none: T,
};
const GROUP_PRIORITY: Group[] = ["hair", "skin", "coat", "acc", "shirt"];

/** Selective outline around the silhouette, plus shadows where materials meet. */
function outline(src: Grid): Grid {
  const g = src.clone();
  for (let y = 0; y < SPRITE_H; y++) {
    for (let x = 0; x < SPRITE_W; x++) {
      const v = src.get(x, y);
      if (v === T) {
        const groups = [src.get(x - 1, y), src.get(x + 1, y), src.get(x, y - 1), src.get(x, y + 1)].map((n) => GROUP[n]);
        const pick = GROUP_PRIORITY.find((p) => groups.includes(p));
        if (pick) g.set(x, y, OUTLINE_SLOT[pick]);
        continue;
      }
      const grp = GROUP[v];
      const up = GROUP[src.get(x, y - 1)];
      const left = GROUP[src.get(x - 1, y)];
      const right = GROUP[src.get(x + 1, y)];
      const down = GROUP[src.get(x, y + 1)];
      // Hair casts a shadow on the forehead and cheeks.
      if (grp === "skin" && (up === "hair" || left === "hair" || right === "hair") && v === SKIN) g.set(x, y, SKIN_SH);
      // Chin and neck meet the collar with a dark line.
      if (grp === "skin" && (down === "coat" || down === "shirt" || down === "acc")) g.set(x, y, SKIN_OL);
      if (grp === "coat" && (up === "skin" || up === "hair") && v !== COAT_OL) g.set(x, y, COAT_OL);
      // Hair edge against the face reads as a darker strand.
      if (grp === "hair" && v === HAIR && (left === "skin" || right === "skin" || down === "skin")) g.set(x, y, HAIR_SH);
      if (grp === "hair" && (down === "coat" || down === "shirt" || down === "acc") && v !== HAIR_HI) g.set(x, y, HAIR_SH);
    }
  }
  return g;
}

// ---------------------------------------------------------------------------
// Pose variants
//
// A pose is a face (mouth shape, eyelids, gaze, brows, cheeks) plus a head
// turn. Every combination is stamped onto the base sprite and compiled the
// first time it is drawn, then cached.

/** Mouth shapes. Talking mixes the open shapes; the rest carry expression. */
export type Mouth =
  | "closed" // flat line
  | "half" // slightly open
  | "open" // open vowel, "ah"
  | "wide" // teeth showing, "ee"
  | "round" // "oo"
  | "smile" // closed, corners up
  | "frown" // closed, corners down
  | "smirk" // closed, one corner up
  | "laugh" // wide open with teeth
  | "grin"; // open, corners up
export type Lids = "open" | "half" | "closed" | "wide" | "happy";
export type Brows = "flat" | "raised" | "furrowed" | "sad" | "skeptical";
export type Turn = -1 | 0 | 1; // -1 looks to screen left, 1 to screen right

export interface Pose {
  mouth: Mouth;
  lids: Lids;
  brows: Brows;
  /** Where the eyes point inside the head: -1..1 across, -1 up .. 1 down. */
  gazeX: -1 | 0 | 1;
  gazeY: -1 | 0 | 1;
  turn: Turn;
  blush?: boolean;
}

export const NEUTRAL_POSE: Pose = { mouth: "closed", lids: "open", brows: "flat", gazeX: 0, gazeY: 0, turn: 0 };

function poseKey(p: Pose): string {
  return `${p.mouth}|${p.lids}|${p.brows}|${p.gazeX}|${p.gazeY}|${p.turn}|${p.blush ? 1 : 0}`;
}

function stampBrows(g: Grid, brows: Brows, L: number, R: number): void {
  // Left brow spans L-1..L+1 (inner end L+1); right brow R..R+2 (inner end R).
  const left = (outer: number, mid: number, inner: number) => {
    g.set(L - 1, outer, BROW);
    g.set(L, mid, BROW);
    g.set(L + 1, inner, BROW);
  };
  const right = (inner: number, mid: number, outer: number) => {
    g.set(R, inner, BROW);
    g.set(R + 1, mid, BROW);
    g.set(R + 2, outer, BROW);
  };
  switch (brows) {
    case "raised":
      left(12, 12, 12);
      right(12, 12, 12);
      break;
    case "furrowed":
      left(13, 13, 14);
      right(14, 13, 13);
      break;
    case "sad":
      left(13, 13, 12);
      right(12, 13, 13);
      break;
    case "skeptical":
      left(12, 12, 13);
      right(13, 13, 13);
      break;
    default:
      left(13, 13, 13);
      right(13, 13, 13);
  }
}

function stampEyes(g: Grid, pose: Pose, L: number, R: number): void {
  const gx = pose.gazeX;
  const gy = pose.gazeY;
  for (const base of [L, R]) {
    const ex = base + gx;
    switch (pose.lids) {
      case "closed":
        g.row(16, base, base + 1, EYE);
        break;
      case "half":
        // Upper lid down: a shaded lid over the top row of the eye.
        g.row(15, base, base + 1, SKIN_SH);
        g.row(16, ex, ex + 1, EYE);
        break;
      case "happy":
        // Smiling eyes: a small upturned arc.
        g.row(15, base, base + 1, EYE);
        g.set(base - 1, 16, EYE);
        g.set(base + 2, 16, EYE);
        break;
      case "wide":
        g.row(14, ex, ex + 1, EYE);
        g.row(15, ex, ex + 1, EYE);
        g.row(16, ex, ex + 1, EYE);
        g.set(ex + (gx > 0 ? 1 : 0), 14, EYE_HI);
        break;
      default: {
        const top = 15 + gy;
        g.row(top, ex, ex + 1, EYE);
        g.row(top + 1, ex, ex + 1, EYE);
        g.set(ex + (gx > 0 ? 1 : 0), top, EYE_HI);
      }
    }
  }
}

function stampMouth(g: Grid, mouth: Mouth, m0: number): void {
  // m0 is the left end of the 4-pixel mouth on row 21.
  switch (mouth) {
    case "half":
      g.row(21, m0, m0 + 3, LIP);
      g.row(22, m0 + 1, m0 + 2, MOUTH);
      break;
    case "open":
      g.row(20, m0, m0 + 3, LIP);
      g.row(21, m0, m0 + 3, MOUTH);
      g.row(22, m0 + 1, m0 + 2, MOUTH);
      break;
    case "wide":
      g.row(20, m0, m0 + 3, LIP);
      g.set(m0 - 1, 21, MOUTH);
      g.row(21, m0, m0 + 3, TEETH);
      g.set(m0 + 4, 21, MOUTH);
      g.row(22, m0, m0 + 3, LIP);
      break;
    case "round":
      g.row(20, m0 + 1, m0 + 2, LIP);
      g.set(m0, 21, LIP);
      g.row(21, m0 + 1, m0 + 2, MOUTH);
      g.set(m0 + 3, 21, LIP);
      g.row(22, m0 + 1, m0 + 2, LIP);
      break;
    case "smile":
      g.set(m0 - 1, 20, LIP);
      g.row(21, m0, m0 + 3, LIP);
      g.set(m0 + 4, 20, LIP);
      break;
    case "frown":
      g.set(m0 - 1, 22, LIP);
      g.row(21, m0, m0 + 3, LIP);
      g.set(m0 + 4, 22, LIP);
      break;
    case "smirk":
      g.row(21, m0, m0 + 3, LIP);
      g.set(m0 + 4, 20, LIP);
      break;
    case "grin":
      g.set(m0 - 1, 20, LIP);
      g.row(21, m0, m0 + 3, MOUTH);
      g.set(m0 + 4, 20, LIP);
      g.row(22, m0 + 1, m0 + 2, LIP);
      break;
    case "laugh":
      g.set(m0 - 1, 20, LIP);
      g.row(20, m0, m0 + 3, TEETH);
      g.set(m0 + 4, 20, LIP);
      g.row(21, m0, m0 + 3, MOUTH);
      g.row(22, m0 + 1, m0 + 2, MOUTH);
      break;
    default:
      g.row(21, m0, m0 + 3, LIP);
  }
}

function stampFeatures(g: Grid, look: AnchorLook, pose: Pose): void {
  const dx = pose.turn;
  const L = CX - 5 + dx; // left eye x (2 px)
  const R = CX + 3 + dx; // right eye x
  stampBrows(g, pose.brows, L, R);
  // Glasses frames sit on rows 14 and 17, so behind them the eyes stay level.
  stampEyes(g, look.glasses ? { ...pose, gazeY: 0 } : pose, L, R);
  // Cheeks: lifted and warmer when smiling.
  const cheekRow = pose.blush ? 17 : 18;
  g.row(cheekRow, L - 2, L - 1, BLUSH);
  g.row(cheekRow, R + 2, R + 3, BLUSH);
  // Nose: a small shadow on the side away from the light.
  g.set(CX + dx, 18, SKIN_SH);
  g.row(19, CX - 1 + dx, CX + dx, SKIN_SH);
  stampMouth(g, pose.mouth, CX - 2 + dx);
  if (look.glasses) {
    for (const ex of [L, R]) {
      const x0 = ex - 2;
      const x1 = ex + 3;
      g.row(14, x0, x1, GLASS);
      g.row(17, x0, x1, GLASS);
      g.set(x0, 15, GLASS);
      g.set(x0, 16, GLASS);
      g.set(x1, 15, GLASS);
      g.set(x1, 16, GLASS);
    }
    g.row(15, L + 4, R - 3, GLASS); // bridge
    g.set(CX - 9 + Math.max(0, dx), 15, GLASS); // temples
    g.set(CX + 8 + Math.min(0, dx), 15, GLASS);
  }
}

function paletteFor(look: AnchorLook): string[] {
  const p = new Array<string>(SLOTS).fill("#ff00ff");
  const skin = look.skin;
  p[SKIN] = skin;
  p[SKIN_SH] = mix(shadeOf(skin, 0.28), "#b04a4a", 0.08);
  p[SKIN_HI] = lightOf(skin, 0.25);
  p[SKIN_OL] = outlineOf(mix(skin, "#6a2a2a", 0.3));
  const hair = look.hair;
  const darkHair = luminance(hair) < 0.03;
  p[HAIR] = hair;
  p[HAIR_SH] = darkHair ? mix(hair, "#000000", 0.5) : shadeOf(hair, 0.35);
  p[HAIR_HI] = darkHair ? mix(hair, "#8a93b8", 0.32) : lightOf(hair, 0.3);
  p[HAIR_OL] = darkHair ? "#050407" : outlineOf(hair);
  p[BUZZ] = mix(hair, skin, 0.45);
  const coat = look.outfit;
  p[COAT] = coat;
  p[COAT_SH] = shadeOf(coat, 0.35);
  p[COAT_HI] = lightOf(coat, 0.2);
  p[COAT_OL] = outlineOf(coat);
  p[ACC] = look.accent;
  p[ACC_SH] = shadeOf(look.accent, 0.22);
  p[ACC_OL] = outlineOf(look.accent);
  p[SHIRT] = "#ece8df";
  p[SHIRT_SH] = shadeOf("#ece8df", 0.2);
  p[EYE] = "#1a1220";
  p[EYE_HI] = "#f4f1ea";
  p[MOUTH] = "#4a1820";
  p[TEETH] = "#f1ece4";
  p[LIP] = mix(skin, "#6b2630", 0.55);
  p[BLUSH] = mix(skin, "#e0606a", 0.28);
  // Brows must read against the skin, so dark skin gets near-black brows.
  p[BROW] = luminance(skin) < 0.2 ? mix(hair, "#08060a", 0.75) : darkHair ? hair : mix(hair, "#1a1018", 0.45);
  p[GLASS] = "#1c1a22";
  return p;
}

/** Colour-grouped runs: for each colour, a flat list [x, y, w, ...] of 1px-tall runs. */
interface CompiledSprite {
  colors: string[];
  runs: Int16Array[];
}

function compile(g: Grid, palette: string[]): CompiledSprite {
  const byColor = new Map<string, number[]>();
  for (let y = 0; y < SPRITE_H; y++) {
    let x = 0;
    while (x < SPRITE_W) {
      const v = g.get(x, y);
      if (v === T) {
        x++;
        continue;
      }
      const x0 = x;
      while (x < SPRITE_W && g.get(x, y) === v) x++;
      const color = palette[v];
      let list = byColor.get(color);
      if (!list) byColor.set(color, (list = []));
      // merge with an identical run straight above to save calls
      const n = list.length;
      if (n >= 4 && y !== HEAD_SPLIT && list[n - 4] === x0 && list[n - 2] === x - x0 && list[n - 3] + list[n - 1] === y) {
        list[n - 1]++;
      } else {
        list.push(x0, y, x - x0, 1);
      }
    }
  }
  return { colors: [...byColor.keys()], runs: [...byColor.values()].map((l) => Int16Array.from(l)) };
}

interface AnchorSprites {
  base: Grid;
  palette: string[];
  variants: Map<string, CompiledSprite>;
  hand: CompiledSprite;
}

const cache = new Map<string, AnchorSprites>();

function lookKey(look: AnchorLook): string {
  return [look.skin, look.hair, look.hairStyle, look.outfit, look.accent, look.glasses ? 1 : 0].join("|");
}

function buildAnchor(look: AnchorLook): AnchorSprites {
  const g = new Grid();
  drawBackHair(g, look.hairStyle);
  drawTorso(g, look);
  drawHead(g);
  drawFrontHair(g, look.hairStyle);
  const palette = paletteFor(look);
  return { base: outline(g), palette, variants: new Map(), hand: buildHand(palette) };
}

// Hand resting on the desk, with a cuff of the jacket sleeve behind it.
const HAND_ROWS = [
  "cccccc.", //
  "cccccc.", //
  "Csssss.", //
  "sssssS.", //
];

function buildHand(palette: string[]): CompiledSprite {
  const g = new Grid();
  const map: Record<string, number> = { c: COAT, C: COAT_SH, s: SKIN, S: SKIN_SH };
  HAND_ROWS.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const v = map[row[x]];
      if (v) g.set(x + 1, y + 1, v);
    }
  });
  return compile(outline(g), palette);
}

function getAnchor(look: AnchorLook): AnchorSprites {
  const key = lookKey(look);
  let a = cache.get(key);
  if (!a) {
    a = buildAnchor(look);
    cache.set(key, a);
  }
  return a;
}

function variant(look: AnchorLook, pose: Pose): CompiledSprite {
  const a = getAnchor(look);
  const key = poseKey(pose);
  let v = a.variants.get(key);
  if (!v) {
    const g = a.base.clone();
    stampFeatures(g, look, pose);
    v = compile(g, a.palette);
    a.variants.set(key, v);
  }
  return v;
}

/**
 * Draw compiled runs. With a head offset the body rows go first and the head
 * rows (above HEAD_SPLIT) are drawn on top, shifted by (headDx, headDy).
 */
function blit(ctx: PixelCtx, s: CompiledSprite, x: number, y: number, maxRow = SPRITE_H, headDx = 0, headDy = 0): void {
  const split = headDx === 0 && headDy === 0 ? 0 : HEAD_SPLIT;
  for (const pass of split ? [0, 1] : [0]) {
    for (let i = 0; i < s.colors.length; i++) {
      ctx.fillStyle = s.colors[i];
      const r = s.runs[i];
      for (let j = 0; j < r.length; j += 4) {
        const ry = r[j + 1];
        if (ry >= maxRow) continue;
        const isHead = split > 0 && ry < split;
        if ((pass === 0) === isHead) continue;
        const h = Math.min(r[j + 3], maxRow - ry);
        if (isHead) ctx.fillRect(x + r[j] + headDx, y + ry + headDy, r[j + 2], h);
        else ctx.fillRect(x + r[j], y + ry, r[j + 2], h);
      }
    }
  }
}

/**
 * Draw an anchor's bust. (x, y) is the sprite's top-left; rows at or below
 * `visibleRows` are skipped (they would be behind the desk anyway).
 */
export function drawAnchor(
  ctx: PixelCtx,
  look: AnchorLook,
  pose: Pose,
  x: number,
  y: number,
  visibleRows = SPRITE_H,
  head: { dx: number; dy: number } = { dx: 0, dy: 0 },
): void {
  blit(ctx, variant(look, pose), Math.round(x), Math.round(y), visibleRows, head.dx, head.dy);
}

export const HAND_W = 9;
export const HAND_H = 6;

/** Draw one hand resting on the desk; (x, y) is the top-left of a 9x6 box. */
export function drawHand(ctx: PixelCtx, look: AnchorLook, x: number, y: number): void {
  blit(ctx, getAnchor(look).hand, Math.round(x), Math.round(y));
}

// ---------------------------------------------------------------------------
// Idle animation helpers (deterministic from time + anchor id)

export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mix32(a: number): number {
  a = Math.imul(a ^ (a >>> 16), 0x7feb352d);
  a = Math.imul(a ^ (a >>> 15), 0x846ca68b);
  return (a ^ (a >>> 16)) >>> 0;
}

const BLINK_WINDOW_MS = 4500;
const BLINK_MS = 160;

/**
 * The blink phase: 0 open, 1 half-closed, 2 closed. A blink runs
 * half / closed / half over ~160ms; blinks land 3..6s apart, different per
 * anchor, with an occasional double blink.
 */
export function blinkPhase(nowMs: number, anchorId: string): 0 | 1 | 2 {
  const h = hashString(anchorId);
  const t = nowMs + (h % 9973) * 7;
  const k = Math.floor(t / BLINK_WINDOW_MS);
  const r = mix32(k ^ h);
  const offset = r % 1500;
  let local = t - k * BLINK_WINDOW_MS - offset;
  if (local >= BLINK_MS + 140 && r % 7 === 0) local -= BLINK_MS + 140; // double blink
  if (local < 0 || local >= BLINK_MS) return 0;
  return local < 40 || local >= 120 ? 1 : 2;
}

export function isBlinking(nowMs: number, anchorId: string): boolean {
  return blinkPhase(nowMs, anchorId) !== 0;
}

/** A deterministic 0..1 value for (anchor, slot), for picking idle behaviour. */
export function noise(anchorId: string, slot: number): number {
  return mix32(hashString(anchorId) ^ Math.imul(slot, 0x9e3779b1)) / 4294967296;
}

/** Breathing: 0 or -1 px, switching every ~2s, phase offset per anchor. */
export function breathOffset(nowMs: number, anchorId: string): number {
  const h = hashString(anchorId);
  const period = 1900 + (h % 300);
  return Math.floor((nowMs + (h % 2000)) / period) % 2 === 0 ? 0 : -1;
}

// ---------------------------------------------------------------------------
// Emotes: small pixel marks around the head that make a mood read at a glance.

export type Emote = "tear" | "sweat" | "anger" | "sparkle" | "exclaim" | "question" | "laugh" | "heart";

const EMOTE_COLORS: Record<string, string> = {
  w: "#f4f1ea", // white
  k: "#120c18", // outline
  b: "#7ec8f0", // water
  B: "#3f8fc4",
  r: "#e8384f", // anger
  y: "#ffd84a", // sparkle
  p: "#ff6f91", // heart
};

const BITMAPS: Record<string, string[]> = {
  exclaim: [".kkk.", "kwwwk", "kwwwk", "kwwwk", ".kwk.", ".kwk.", "..k..", ".kwk.", ".kkk."],
  question: [".kkkk.", "kwwwwk", "kkk.wk", "..kwwk", ".kwkk.", ".kwk..", "..k...", ".kwk..", ".kkk.."],
  anger: ["r.r.r", ".r.r.", "rr.rr", ".r.r.", "r.r.r"],
  heart: [".pp.pp.", "ppppppp", "ppppppp", ".ppppp.", "..ppp..", "...p..."],
  sweat: ["..b.", ".bb.", "bbbB", "bbbB", ".BB."],
  sparkleBig: ["..y..", "..y..", "yyyyy", "..y..", "..y.."],
  sparkleSmall: [".y.", "yyy", ".y."],
};

function stamp(ctx: PixelCtx, rows: string[], x: number, y: number): void {
  rows.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) {
      const c = EMOTE_COLORS[row[dx]];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x + dx, y + dy, 1, 1);
    }
  });
}

/**
 * Draw an emote for an anchor whose sprite top-left is (x, y), with the head
 * offset already added. `ms` is the time since the emote started, for its
 * small loop of animation.
 */
export function drawEmote(ctx: PixelCtx, emote: Emote, x: number, y: number, ms: number, turn: Turn): void {
  const dx = turn;
  const pop = ms < 120 ? 1 : 0; // a one-pixel pop as it appears
  switch (emote) {
    case "exclaim":
      stamp(ctx, BITMAPS.exclaim, x + CX + 7, y - 6 - pop);
      break;
    case "question":
      stamp(ctx, BITMAPS.question, x + CX + 7, y - 6 - (Math.floor(ms / 400) % 2));
      break;
    case "anger": {
      // Pulses at the temple.
      if (Math.floor(ms / 300) % 2 === 0) stamp(ctx, BITMAPS.anger, x + CX + 5, y + 1);
      break;
    }
    case "heart":
      stamp(ctx, BITMAPS.heart, x + CX + 8, y - 4 - (Math.floor(ms / 350) % 2));
      break;
    case "sweat":
      stamp(ctx, BITMAPS.sweat, x + CX + 9, y + 8 + Math.min(3, Math.floor(ms / 250)));
      break;
    case "tear": {
      // A drop runs down from each eye, on a loop.
      const fall = Math.floor(ms / 110) % 6;
      for (const ex of [CX - 5 + dx, CX + 4 + dx]) {
        ctx.fillStyle = EMOTE_COLORS.b;
        ctx.fillRect(x + ex, y + 17 + fall, 1, 2);
        ctx.fillStyle = EMOTE_COLORS.B;
        ctx.fillRect(x + ex, y + 17 + fall + 1, 1, 1);
      }
      break;
    }
    case "sparkle": {
      const t = Math.floor(ms / 220) % 4;
      stamp(ctx, t % 2 === 0 ? BITMAPS.sparkleBig : BITMAPS.sparkleSmall, x + CX - 15 + (t % 2), y + 2);
      stamp(ctx, t % 2 === 1 ? BITMAPS.sparkleBig : BITMAPS.sparkleSmall, x + CX + 11, y - 2 + (t % 2));
      if (t === 2) stamp(ctx, BITMAPS.sparkleSmall, x + CX + 9, y + 12);
      break;
    }
    case "laugh": {
      // Short lines either side of the head, jumping with the laugh.
      const up = Math.floor(ms / 140) % 2;
      ctx.fillStyle = EMOTE_COLORS.w;
      for (const [lx, ly] of [[CX - 13, 10], [CX - 14, 13], [CX + 11, 10], [CX + 12, 13]]) ctx.fillRect(x + lx, y + ly - up, 2, 1);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// For the 2x characters (character.ts): the outlined base grid and palette.

export const SLOT = {
  T, SKIN, SKIN_SH, SKIN_HI, SKIN_OL, HAIR, HAIR_SH, HAIR_HI, HAIR_OL,
  COAT, COAT_SH, COAT_HI, COAT_OL, ACC, ACC_SH, ACC_OL, SHIRT, SHIRT_SH,
  EYE, EYE_HI, MOUTH, LIP, BLUSH, BROW, GLASS, BUZZ, TEETH, COUNT: SLOTS,
} as const;

/** The outlined 48x64 base (hair, head, torso; no face features) and its palette. */
export function baseSlots(look: AnchorLook): { data: Uint8Array; palette: string[] } {
  const a = getAnchor(look);
  return { data: a.base.d, palette: a.palette };
}
