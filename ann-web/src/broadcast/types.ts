// Shared shapes for the live broadcast. The Python broadcast engine writes
// segments in this shape (ann-agents/src/ann_agents/broadcast/models.py),
// /api/live/now serves them, and both the web player and the YouTube
// streamer render them with scene.ts.

export interface AnchorLook {
  skin: string;
  hair: string;
  hairStyle: "bob" | "short" | "long" | "buzz";
  outfit: string;
  accent: string;
  glasses: boolean;
}

export interface Anchor {
  id: string;
  name: string;
  role: string;
  voice: string;
  look: AnchorLook;
  persona: string;
}

export interface Show {
  id: string;
  name: string;
  blurb: string;
  anchors: string[];
  categories: string[];
  color: string;
  segmentsPerStory: number;
}

export interface GridSlot {
  hourUtc: number;
  show: string;
}

// A beat journalist: writes that beat's stories (the byline on the site).
export interface Reporter {
  id: string;
  name: string;
  beat: string; // database category, e.g. open_source
  title: string;
  voice: string;
  look: AnchorLook;
  bio: string;
  style: string;
}

export interface Lineup {
  network: string;
  anchors: Anchor[];
  shows: Show[];
  grid: GridSlot[];
  reporters: Reporter[];
  beats: Record<string, string>; // category -> reporter id
}

export interface SegmentArticle {
  id: string;
  title: string;
  source: string;
  url: string;
}

export interface ScriptLine {
  speaker: string; // anchor id
  text: string;
  startMs: number; // offset from the segment start
  durationMs: number;
  audio?: string | null; // path under /api/live/audio/
  mouth?: number[] | null; // mouth openness 0..1 sampled at MOUTH_FPS
  factIds?: number[];
}

export type SegmentKind = "story" | "reel" | "ident";

export interface Segment {
  id: string;
  showId: string;
  kind: SegmentKind;
  startsAt: string; // ISO timestamp, UTC
  durationMs: number;
  title: string; // lower-third headline
  anchors: string[]; // who sits at the desk, left to right
  articles: SegmentArticle[];
  lines: ScriptLine[];
}

export interface LiveNow {
  serverTime: string;
  segments: Segment[]; // the one on air first, then what is queued
}

export const MOUTH_FPS = 15;
