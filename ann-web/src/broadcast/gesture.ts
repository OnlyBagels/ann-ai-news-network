// Arms and props: what each anchor's hands are doing this frame.
//
// Like face.ts this is a pure function of time and ids. Actions are laid out
// in time slots per anchor (a sip of coffee, a note scribbled, a shrug), so
// every frame can work out where it is in an action without keeping state.

import { CHAR_DESK_ROW, restArm, type Arm, type HandShape } from "./character";
import { noise } from "./sprites";
import type { Mood } from "./types";

const CX = 48;

export interface Hands {
  left: Arm; // screen left = the character's right
  right: Arm;
  /** The mug is in the screen-right hand, at this point (character coords), or on the desk. */
  mug: { inHand: boolean; x: number; y: number };
  /** Notes held up in front of the chest. */
  sheet: { x: number; y: number } | null;
  /** A pen in the screen-right hand. */
  pen: boolean;
}

export interface GestureInput {
  anchorId: string;
  nowMs: number;
  talking: boolean;
  someoneTalking: boolean;
  mood: Mood;
  /** ms into the current line, the line's length, and its index in the segment. */
  lineElapsedMs: number;
  lineMs: number;
  lineIndex: number;
  /** The word being said, for timing gestures to speech. */
  word: number;
  standing: boolean;
  /** For a presenter beside a board: which side the board is on (-1 left, 1 right), else 0. */
  boardSide: -1 | 0 | 1;
  /** Time left in the segment. */
  segmentLeftMs: number;
}

/** Where the mug sits on the desk, in character coordinates (top-left of the mug). */
export const MUG_HOME = { x: CX + 34, y: CHAR_DESK_ROW - 10 };
// Where the hand goes to bring the mug to the mouth (the mug sits left of the hand).
const SIP_HAND = { x: CX + 8, y: 46 };

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function to(a: Arm, hx: number, hy: number, t: number, shape: HandShape): Arm {
  const k = ease(t);
  return { hx: lerp(a.hx, hx, k), hy: lerp(a.hy, hy, k), shape: k > 0.5 ? shape : a.shape };
}

/** Progress through an action window: ramps 0→1 over `rampMs`, holds, then back to 0. */
function envelope(t: number, length: number, rampMs: number): number {
  if (t < 0 || t > length) return 0;
  return Math.min(1, t / rampMs, (length - t) / rampMs);
}

/** A slot-based occasional action: returns ms into the action or -1. */
function occasional(anchorId: string, nowMs: number, salt: number, period: number, length: number, chance: number): number {
  const shifted = nowMs + noise(anchorId, salt) * period;
  const slot = Math.floor(shifted / period);
  if (noise(anchorId, salt * 31 + slot) >= chance) return -1;
  const into = shifted - slot * period;
  return into < length ? into : -1;
}

export function gesture(g: GestureInput): Hands {
  const restL = restArm(-1, g.standing);
  const restR = restArm(1, g.standing);
  let left = restL;
  let right = restR;
  const hands: Hands = { left, right, mug: { inHand: false, ...MUG_HOME }, sheet: null, pen: false };

  // Standing beside a board: the near hand points at it while talking.
  if (g.standing) {
    if (g.talking && g.boardSide !== 0) {
      const w = envelope(g.lineElapsedMs, g.lineMs, 350);
      const ptX = CX + g.boardSide * 74;
      const bob = Math.sin((g.nowMs / 400) * Math.PI) * 2;
      if (g.boardSide > 0) right = to(restR, ptX, 74 + bob, w, "point");
      else left = to(restL, ptX, 74 + bob, w, "point");
      const other = g.boardSide > 0 ? "left" : "right";
      const beat = 0.5 - 0.5 * Math.cos((g.lineElapsedMs / 650) * Math.PI * 2);
      if (other === "left") left = to(restL, CX - 26, 92, beat * w * 0.8, "open");
      else right = to(restR, CX + 26, 92, beat * w * 0.8, "open");
      right.pointDir = 1;
      left.pointDir = -1;
    } else if (g.talking) {
      const beat = 0.5 - 0.5 * Math.cos((g.lineElapsedMs / 700) * Math.PI * 2);
      right = to(restR, CX + 30, 90, beat, "open");
    }
    return { ...hands, left, right };
  }

  if (g.talking) {
    const t = g.lineElapsedMs;
    const w = envelope(t, g.lineMs, 300);
    // Opening a segment: read from the notes.
    if (g.lineIndex === 0 && t < 1800) {
      const k = envelope(t, 1800, 350);
      left = to(restL, CX - 14, 96, k, "grip");
      right = to(restR, CX + 14, 96, k, "grip");
      if (k > 0.6) hands.sheet = { x: CX - 14, y: 70 };
      return { ...hands, left, right };
    }
    const wordGesture = noise(g.anchorId, 2000 + g.lineIndex * 131 + g.word) < 0.55;
    const beat = 0.5 - 0.5 * Math.cos((t / 620) * Math.PI * 2);
    switch (g.mood) {
      case "excited": {
        left = to(restL, CX - 32, 78 + beat * 8, w, "open");
        right = to(restR, CX + 32, 86 - beat * 8, w, "open");
        break;
      }
      case "angry": {
        // A fist comes down on the desk on stressed words.
        const slam = wordGesture ? Math.abs(Math.sin((t / 420) * Math.PI)) : 0;
        right = to(restR, CX + 22, CHAR_DESK_ROW + 2 - slam * 22, w, "fist");
        break;
      }
      case "empathetic":
      case "sad":
        right = to(restR, CX + 6, 76, w, "flat");
        break;
      case "skeptical":
      case "confused": {
        // A shrug, palms up.
        const shrug = envelope(t, Math.min(g.lineMs, 1600), 300);
        left = to(restL, CX - 36, 96, shrug, "open");
        right = to(restR, CX + 36, 96, shrug, "open");
        break;
      }
      case "surprised": {
        const up = envelope(t, 900, 200);
        left = to(restL, CX - 30, 74, up, "open");
        right = to(restR, CX + 30, 74, up, "open");
        break;
      }
      default:
        // Conversational: the right hand rises and falls with the words.
        if (wordGesture) right = to(restR, CX + 30, 82 + beat * 10, w * (0.4 + beat * 0.6), "open");
    }
    hands.pen = false;
    return { ...hands, left, right };
  }

  // Listening, or waiting between lines.
  if (g.someoneTalking) {
    switch (g.mood) {
      case "empathetic":
      case "sad":
        right = to(restR, CX + 6, 76, envelope(g.lineElapsedMs, g.lineMs, 400), "flat");
        return { ...hands, left, right };
      case "skeptical":
      case "confused":
        // Chin in hand.
        right = to(restR, CX + 10, 50, envelope(g.lineElapsedMs, g.lineMs, 450), "fist");
        return { ...hands, left, right };
      case "excited": {
        // A short burst of applause.
        const clap = envelope(g.lineElapsedMs, 1400, 200);
        const beat = Math.abs(Math.sin((g.nowMs / 130) * Math.PI));
        left = to(restL, CX - 4 - beat * 8, 84, clap, "flat");
        right = to(restR, CX + 4 + beat * 8, 84, clap, "flat");
        return { ...hands, left, right };
      }
      case "happy":
        if (noise(g.anchorId, 3000 + g.lineIndex) < 0.35) {
          right = to(restR, CX + 28, 84, envelope(g.lineElapsedMs, 1100, 220), "thumb");
          return { ...hands, left, right };
        }
        break;
      default:
        break;
    }
  }

  // Coffee: reach, lift, sip, put down.
  const sip = occasional(g.anchorId, g.nowMs, 41, 9000, 2400, g.mood === "angry" || g.mood === "sad" ? 0 : 0.4);
  if (sip >= 0 && g.segmentLeftMs > 2500) {
    const mugGrip = { x: MUG_HOME.x + 4, y: MUG_HOME.y + 6 };
    if (sip < 400) {
      right = to(restR, mugGrip.x, mugGrip.y, sip / 400, "grip");
    } else if (sip < 2000) {
      const up = sip < 900 ? ease((sip - 400) / 500) : sip > 1600 ? 1 - ease((sip - 1600) / 400) : 1;
      const hx = lerp(mugGrip.x, SIP_HAND.x, up);
      const hy = lerp(mugGrip.y, SIP_HAND.y, up);
      right = { hx, hy, shape: "grip" };
      hands.mug = { inHand: true, x: hx - 13, y: hy - 7 };
    } else {
      right = to({ hx: mugGrip.x, hy: mugGrip.y, shape: "grip" }, restR.hx, restR.hy, (sip - 2000) / 400, "flat");
    }
    return { ...hands, left, right };
  }

  // Notes: a few scribbles with a pen.
  const write = occasional(g.anchorId, g.nowMs, 77, 7000, 2600, 0.3);
  if (write >= 0) {
    const k = envelope(write, 2600, 300);
    const jx = Math.round(Math.sin(write / 60) * 2);
    left = to(restL, CX - 10 + jx, CHAR_DESK_ROW + 2, k, "grip");
    hands.pen = k > 0.5;
    return { ...hands, left, right };
  }

  // End of the segment: tidy the notes.
  if (g.segmentLeftMs < 1400 && g.segmentLeftMs > 0) {
    const tap = Math.abs(Math.sin((g.segmentLeftMs / 180) * Math.PI)) * 6;
    left = to(restL, CX - 14, CHAR_DESK_ROW - tap, 1, "grip");
    right = to(restR, CX + 14, CHAR_DESK_ROW - tap, 1, "grip");
    hands.sheet = { x: CX - 14, y: CHAR_DESK_ROW - 30 - tap };
  }
  return { ...hands, left, right };
}
