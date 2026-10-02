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

// The studio areas. Each show has a home set; a segment can move to another
// (the weather hit on the morning show goes to the weather wall).
export type StudioSet = "desk" | "weather" | "sports" | "markets" | "latenight";

// Data shown on a set's wall. Always real data from the named source;
// a set with no data shows its frame and says so, never invented numbers.
export interface WeatherBoard {
  kind: "weather";
  source: string; // e.g. "Open-Meteo"
  asOf: string; // ISO time the data was fetched
  places: { name: string; lat: number; lon: number; tempF: number; icon: WeatherIcon; hiF?: number; loF?: number }[];
}
export type WeatherIcon = "sun" | "partly" | "cloud" | "rain" | "storm" | "snow" | "fog" | "night";

export interface SportsBoard {
  kind: "sports";
  source: string;
  asOf: string;
  games: { league: string; away: string; home: string; awayScore: number | null; homeScore: number | null; status: string }[];
}

export interface MarketsBoard {
  kind: "markets";
  source: string;
  asOf: string;
  quotes: { symbol: string; name: string; price: number; changePct: number; spark: number[] }[];
}

export type Board = WeatherBoard | SportsBoard | MarketsBoard;

export interface Show {
  id: string;
  set?: StudioSet;
  weather?: boolean;
  sports?: boolean;
  markets?: boolean;
  name: string;
  blurb: string;
  anchors: string[];
  categories: string[];
  color: string;
  segmentsPerStory: number;
}

export interface GridSlot {
  hourEt: number; // hour of the day, US Eastern
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
  timezone?: string;
}

export interface SegmentArticle {
  id: string;
  title: string;
  source: string;
  url: string;
}

// How the speaker feels saying a line. The writer picks one per line; the
// renderer turns it into a face, and the other anchors react to it.
export const MOODS = [
  "neutral",
  "happy",
  "excited",
  "amused",
  "concerned",
  "empathetic",
  "sad",
  "angry",
  "serious",
  "surprised",
  "skeptical",
  "confused",
] as const;
export type Mood = (typeof MOODS)[number];

export interface ScriptLine {
  speaker: string; // anchor id
  text: string;
  mood?: Mood | null;
  startMs: number; // offset from the segment start
  durationMs: number;
  audio?: string | null; // path under /api/live/audio/
  mouth?: number[] | null; // mouth openness 0..1 sampled at MOUTH_FPS
  factIds?: number[];
}

export type SegmentKind = "story" | "reel" | "ident" | "weather" | "sports" | "markets" | "bit";

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
  set?: StudioSet;
  board?: Board | null;
}

export interface LiveNow {
  serverTime: string;
  segments: Segment[]; // the one on air first, then what is queued
}

export const MOUTH_FPS = 15;
