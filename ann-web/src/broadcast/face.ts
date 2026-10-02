// Acting: turns a script line, its mood and the clock into each anchor's
// face, head movement and hand gestures. Everything is a pure function of
// time and ids, so the web player and the streamer draw the same frame.

import { blinkPhase, noise, type Brows, type Emote, type Lids, type Mouth, type Pose, type Turn } from "./sprites";
import type { Mood, ScriptLine } from "./types";
import { MOODS } from "./types";

interface Face {
  brows: Brows;
  lids: Lids;
  /** Mouth between words and when listening. */
  rest: Mouth;
  blush: boolean;
  /** Head lean in pixels: + to screen right. */
  tilt: number;
  gazeY: -1 | 0 | 1;
  /** Talk with the corners of the mouth up. */
  talkSmile: boolean;
  /** How much the head and hands move: 0.5 still .. 2 bouncing. */
  energy: number;
}

const FACES: Record<Mood, Face> = {
  neutral: { brows: "flat", lids: "open", rest: "closed", blush: false, tilt: 0, gazeY: 0, talkSmile: false, energy: 1 },
  happy: { brows: "flat", lids: "open", rest: "smile", blush: true, tilt: 0, gazeY: 0, talkSmile: true, energy: 1.2 },
  excited: { brows: "raised", lids: "wide", rest: "grin", blush: true, tilt: 0, gazeY: 0, talkSmile: true, energy: 2 },
  amused: { brows: "raised", lids: "happy", rest: "smile", blush: true, tilt: 0, gazeY: 0, talkSmile: true, energy: 1.3 },
  concerned: { brows: "sad", lids: "open", rest: "frown", blush: false, tilt: 0, gazeY: 0, talkSmile: false, energy: 0.8 },
  empathetic: { brows: "sad", lids: "half", rest: "smile", blush: false, tilt: 1, gazeY: 0, talkSmile: false, energy: 0.6 },
  sad: { brows: "sad", lids: "half", rest: "frown", blush: false, tilt: 0, gazeY: 1, talkSmile: false, energy: 0.5 },
  angry: { brows: "furrowed", lids: "half", rest: "frown", blush: true, tilt: 0, gazeY: 0, talkSmile: false, energy: 1.6 },
  serious: { brows: "furrowed", lids: "open", rest: "closed", blush: false, tilt: 0, gazeY: 0, talkSmile: false, energy: 0.8 },
  surprised: { brows: "raised", lids: "wide", rest: "round", blush: false, tilt: 0, gazeY: 0, talkSmile: false, energy: 1.4 },
  skeptical: { brows: "skeptical", lids: "half", rest: "smirk", blush: false, tilt: -1, gazeY: 0, talkSmile: false, energy: 0.9 },
  confused: { brows: "skeptical", lids: "open", rest: "smirk", blush: false, tilt: 1, gazeY: 0, talkSmile: false, energy: 0.9 },
};

export function moodOf(line: ScriptLine | null | undefined): Mood {
  const m = line?.mood;
  if (m && (MOODS as readonly string[]).includes(m)) return m;
  return "neutral";
}

/** How a listener takes the speaker's mood; varies by anchor and line. */
function reaction(speaker: Mood, anchorId: string, lineIndex: number): Mood {
  const r = noise(anchorId, 7001 + lineIndex);
  switch (speaker) {
    case "excited":
      return r < 0.5 ? "excited" : "happy";
    case "angry":
      return r < 0.5 ? "concerned" : "serious";
    case "sad":
      return "empathetic";
    case "skeptical":
      return r < 0.5 ? "skeptical" : "amused";
    case "confused":
      return r < 0.5 ? "confused" : "amused";
    default:
      return speaker;
  }
}

const FRAME_MS = 1000 / 15;

/** The letter being said at this moment (the text is spread over the line's duration). */
export function letterAt(line: ScriptLine, elapsedMs: number): { ch: string; word: number } {
  const text = line.text.toLowerCase();
  if (!text || line.durationMs <= 0) return { ch: " ", word: 0 };
  const t = (Math.floor(elapsedMs / FRAME_MS) + 0.5) * FRAME_MS;
  const idx = Math.max(0, Math.min(text.length - 1, Math.floor((t / line.durationMs) * text.length)));
  let word = 0;
  for (let i = 0; i < idx; i++) if (text[i] === " ") word++;
  return { ch: text[idx], word };
}

/** Pick a mouth shape from loudness and the letter being said. */
function talkMouth(open: number, ch: string, face: Face, mood: Mood): Mouth {
  if (open < 0.18 || ch === "m" || ch === "b" || ch === "p") {
    return face.rest === "smile" || face.rest === "grin" ? "smile" : "closed";
  }
  if (ch === "o" || ch === "u" || ch === "w") return "round";
  if ((ch === "e" || ch === "i" || ch === "y") && open >= 0.35) return face.talkSmile ? "grin" : "wide";
  if (open < 0.5) return "half";
  if (mood === "amused" && open > 0.7 && (ch === "a" || ch === "h")) return "laugh";
  if (mood === "angry") return "wide";
  return face.talkSmile ? "grin" : "open";
}

export interface Acting {
  pose: Pose;
  head: { dx: number; dy: number };
  /** Hand lift in pixels for the left and right hand. */
  hands: [number, number];
  /** A pixel mark that spells out the mood, and how long it has been up. */
  emote: { kind: Emote; ms: number } | null;
  /** The mood this anchor is showing (their own, or their reaction). */
  mood: Mood;
}

// Marks that stay up while the mood lasts, and ones that pop up briefly.
const LASTING: Partial<Record<Mood, Emote>> = { sad: "tear", angry: "anger", excited: "sparkle" };
const BRIEF: Partial<Record<Mood, [Emote, number]>> = {
  surprised: ["exclaim", 1300],
  confused: ["question", 1800],
  concerned: ["sweat", 1500],
  empathetic: ["heart", 1300],
};

function emoteFor(mood: Mood, ms: number): { kind: Emote; ms: number } | null {
  const lasting = LASTING[mood];
  if (lasting) return { kind: lasting, ms };
  const brief = BRIEF[mood];
  if (brief && ms < brief[1]) return { kind: brief[0], ms };
  return null;
}

export interface ActInput {
  anchorId: string;
  seat: number;
  nowMs: number;
  /** Seat of whoever is talking right now, or -1. */
  speakerSeat: number;
  /** The line being said (or the last one, during a pause). */
  line: ScriptLine | null;
  lineIndex: number;
  lineElapsedMs: number;
  /** Seat of the previous line's speaker, or -1. */
  previousSeat: number;
  /** Mouth openness 0..1 from the voice, when this anchor is talking. */
  open: number;
}

const sign = (n: number): -1 | 0 | 1 => (n > 0 ? 1 : n < 0 ? -1 : 0);

function withBlink(lids: Lids, nowMs: number, anchorId: string): Lids {
  const phase = blinkPhase(nowMs, anchorId);
  if (phase === 2) return "closed";
  if (phase === 1 && (lids === "open" || lids === "wide")) return "half";
  return lids;
}

/** Idle eye movement: a new place to look every 1.6 to 3.6 s. */
function saccade(nowMs: number, anchorId: string): { x: -1 | 0 | 1; y: -1 | 0 | 1 } {
  const slot = Math.floor((nowMs + noise(anchorId, 1) * 4000) / 2600);
  const r = noise(anchorId, 100 + slot);
  if (r < 0.45) return { x: 0, y: 0 };
  if (r < 0.62) return { x: -1, y: 0 };
  if (r < 0.79) return { x: 1, y: 0 };
  if (r < 0.92) return { x: 0, y: 1 };
  return { x: 0, y: -1 };
}

export function act(input: ActInput): Acting {
  const { anchorId, seat, nowMs, speakerSeat, line, lineIndex, lineElapsedMs, previousSeat, open } = input;
  const talking = speakerSeat === seat && line !== null;
  const someoneTalking = speakerSeat >= 0 && line !== null;
  const lineMood = moodOf(line);

  if (talking) {
    const face = FACES[lineMood];
    const { ch, word } = letterAt(line!, lineElapsedMs);
    let brows = face.brows;
    // A flash of the brows to start a line, and raised brows at the end of a question.
    if (lineElapsedMs < 320 && face.energy >= 1 && brows === "flat") brows = "raised";
    if (line!.text.trim().endsWith("?") && lineElapsedMs > line!.durationMs * 0.65 && brows !== "furrowed") brows = "raised";

    // Look at whoever spoke last as the line starts, then at the camera, with
    // the odd glance down at the notes.
    let gazeX: -1 | 0 | 1 = 0;
    let gazeY: -1 | 0 | 1 = face.gazeY;
    let turn: Turn = 0;
    if (previousSeat >= 0 && previousSeat !== seat && lineElapsedMs < 450) {
      gazeX = sign(previousSeat - seat);
      turn = gazeX;
    } else {
      const notesSlot = Math.floor((nowMs + noise(anchorId, 2) * 5000) / 5200);
      const intoSlot = (nowMs + noise(anchorId, 2) * 5000) % 5200;
      if (noise(anchorId, 300 + notesSlot) < 0.35 && intoSlot < 420) gazeY = 1;
    }

    // Head: bob on stressed words; how often depends on the energy of the mood.
    const stressed = noise(anchorId, 500 + lineIndex * 97 + word) < 0.22 * face.energy && open > 0.35;
    const dy = stressed ? 1 : 0;
    let dx = face.tilt;
    if (lineMood === "excited" && stressed) dx = noise(anchorId, 900 + word) < 0.5 ? -1 : 1;

    // Hands keep time with the words.
    const beatMs = 650 / face.energy;
    const beat = Math.floor(lineElapsedMs / beatMs) % 4;
    const lift = lineMood === "excited" ? 2 : 1;
    const hands: [number, number] = [beat === 1 ? lift : 0, beat === 3 ? lift : 0];

    return {
      pose: {
        mouth: talkMouth(open, ch, face, lineMood),
        lids: withBlink(face.lids, nowMs, anchorId),
        brows,
        gazeX,
        gazeY,
        turn,
        blush: face.blush,
      },
      head: { dx, dy },
      hands,
      emote: emoteFor(lineMood, lineElapsedMs),
      mood: lineMood,
    };
  }

  if (someoneTalking) {
    let mood = reaction(lineMood, anchorId, lineIndex);
    // Surprise only lasts the first moment of a line.
    if (mood === "surprised" && lineElapsedMs > 900) mood = "neutral";
    const face = FACES[mood];
    const toward = sign(speakerSeat - seat);
    // Mostly watch the speaker; now and then glance at the camera.
    const glanceSlot = Math.floor((nowMs + noise(anchorId, 3) * 3000) / 3400);
    const glancing = noise(anchorId, 400 + glanceSlot) < 0.2 && (nowMs + noise(anchorId, 3) * 3000) % 3400 < 700;
    const gazeX: -1 | 0 | 1 = glancing ? 0 : toward;
    const turn: Turn = glancing ? 0 : toward;

    // Nods while listening; a slow head shake for bad news.
    const nodPeriod = mood === "concerned" || mood === "serious" || mood === "empathetic" ? 3000 : 2200;
    const nt = nowMs + noise(anchorId, 4) * nodPeriod;
    const nodSlot = Math.floor(nt / nodPeriod);
    const inNod = nt % nodPeriod;
    let dy = 0;
    let dx = face.tilt;
    const r = noise(anchorId, 600 + nodSlot);
    if ((mood === "concerned" || mood === "angry") && r < 0.3 && inNod < 480) {
      dx = Math.floor(inNod / 120) % 2 === 0 ? -1 : 1;
    } else if (r < 0.55 && inNod < 300) {
      dy = 1;
    }

    // A laugh at the punchline when the speaker is amused.
    let mouth = face.rest;
    let emote = emoteFor(mood, lineElapsedMs);
    const punchline = lineElapsedMs - line!.durationMs * 0.6;
    if ((lineMood === "amused" || lineMood === "excited") && punchline > 0 && noise(anchorId, 800 + lineIndex) < 0.6) {
      mouth = Math.floor(nowMs / 140) % 2 === 0 ? "laugh" : "grin";
      emote = { kind: "laugh", ms: punchline };
    }

    return {
      pose: {
        mouth,
        lids: withBlink(face.lids, nowMs, anchorId),
        brows: face.brows,
        gazeX,
        gazeY: face.gazeY,
        turn,
        blush: face.blush,
      },
      head: { dx, dy },
      hands: [0, 0],
      emote,
      mood,
    };
  }

  // Between lines and before the first one: settle, look around, blink.
  const idleMood: Mood = line ? reaction(lineMood, anchorId, lineIndex) : "neutral";
  const face = FACES[idleMood];
  const eyes = saccade(nowMs, anchorId);
  return {
    pose: {
      mouth: face.rest,
      lids: withBlink(face.lids, nowMs, anchorId),
      brows: face.brows,
      gazeX: eyes.x,
      gazeY: eyes.y,
      turn: 0,
      blush: face.blush,
    },
    head: { dx: face.tilt, dy: 0 },
    hands: [0, 0],
    emote: null,
    mood: idleMood,
  };
}

/** The face for a mood, resting or mid-word, looking at the camera (for previews and portraits). */
export function expressionPose(mood: Mood, talking: boolean): Pose {
  const face = FACES[mood];
  return {
    mouth: talking ? talkMouth(0.8, "a", face, mood) : face.rest,
    lids: face.lids,
    brows: face.brows,
    gazeX: 0,
    gazeY: face.gazeY,
    turn: 0,
    blush: face.blush,
  };
}
