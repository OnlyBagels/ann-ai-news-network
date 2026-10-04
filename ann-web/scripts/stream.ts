/**
 * The ANN Live streamer: renders the shared timeline and pushes it to
 * YouTube (or any RTMP ingest) with ffmpeg, picture and voices in sync.
 *
 *   YOUTUBE_STREAM_KEY=xxxx npx tsx scripts/stream.ts
 *   npx tsx scripts/stream.ts --out rtmp://host/app/key
 *   npx tsx scripts/stream.ts --out ./test.mp4 --seconds 30   # record a sample instead
 *
 * It reads the timeline from the site's /api/live/now (ANN_SITE_URL,
 * default http://localhost:3000) and checks in as a viewer, so the
 * director keeps writing while the stream is up. Frames are drawn with the
 * same scene.ts the web player uses, at 640x360, and scaled 3x to 1080p by
 * ffmpeg with nearest-neighbour so the pixels stay square.
 */
import { spawn } from "node:child_process";
import { hostname } from "node:os";
import { Writable } from "node:stream";
import { createCanvas } from "@napi-rs/canvas";
import { drawFrame, currentLine, easternClock, WIDTH, HEIGHT } from "../src/broadcast/scene";
import type { LiveNow, Lineup, Segment } from "../src/broadcast/types";
import lineupJson from "../src/broadcast/lineup.json";

const lineup = lineupJson as Lineup;
const FPS = 30;
const SAMPLE_RATE = 22050; // Piper's medium voices
const SAMPLES_PER_FRAME = SAMPLE_RATE / FPS; // 735
const POLL_MS = 5_000;
const CHECKIN_MS = 60_000;

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const site = (process.env.ANN_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
const key = process.env.YOUTUBE_STREAM_KEY;
const out = flag("--out") ?? (key ? `rtmp://a.rtmp.youtube.com/live2/${key}` : undefined);
const seconds = flag("--seconds") ? Number(flag("--seconds")) : undefined;
if (!out) {
  console.error("Set YOUTUBE_STREAM_KEY, or pass --out <rtmp url or file.mp4>.");
  process.exit(1);
}
const isRtmp = out.startsWith("rtmp://") || out.startsWith("rtmps://");

// ── Timeline ──

let live: LiveNow = { serverTime: new Date().toISOString(), segments: [] };
let offsetMs = 0; // server clock minus this clock

async function poll() {
  const sent = Date.now();
  try {
    const res = await fetch(`${site}/api/live/now`, { cache: "no-store" });
    const data = (await res.json()) as LiveNow;
    offsetMs = Date.parse(data.serverTime) - (sent + Date.now()) / 2;
    live = data;
    for (const segment of data.segments) preloadAudio(segment);
  } catch (error) {
    console.error(`[stream] timeline poll failed: ${(error as Error).message}`);
  }
}

const viewerId = `streamer-${hostname().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40) || "host"}`;
async function checkIn() {
  try {
    await fetch(`${site}/api/live/checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: viewerId }),
    });
  } catch {
    // The next check-in will try again.
  }
}

function onAir(nowMs: number): { segment: Segment | null; upcoming: Segment[] } {
  const segment =
    live.segments.find((s) => {
      const start = Date.parse(s.startsAt);
      return start <= nowMs && nowMs < start + s.durationMs;
    }) ?? null;
  return { segment, upcoming: live.segments.filter((s) => Date.parse(s.startsAt) > nowMs) };
}

// ── Audio ──

const clips = new Map<string, Int16Array | "loading" | "missing">();

function preloadAudio(segment: Segment) {
  for (const line of segment.lines) {
    if (!line.audio || clips.has(line.audio)) continue;
    const file = line.audio;
    clips.set(file, "loading");
    fetch(`${site}/api/live/audio/${file}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        clips.set(file, decodeWav(Buffer.from(await res.arrayBuffer())));
      })
      .catch((error) => {
        console.error(`[stream] could not load ${file}: ${(error as Error).message}`);
        clips.set(file, "missing");
      });
  }
}

/** 16-bit PCM WAV to mono samples at SAMPLE_RATE. */
function decodeWav(buf: Buffer): Int16Array {
  let pos = 12;
  let rate = SAMPLE_RATE;
  let channels = 1;
  let bits = 16;
  while (pos + 8 <= buf.length) {
    const id = buf.toString("ascii", pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    if (id === "fmt ") {
      channels = buf.readUInt16LE(pos + 10);
      rate = buf.readUInt32LE(pos + 12);
      bits = buf.readUInt16LE(pos + 22);
    } else if (id === "data") {
      if (bits !== 16) throw new Error(`expected 16-bit audio, got ${bits}-bit`);
      const frames = Math.floor(size / (2 * channels));
      const outLength = Math.floor((frames * SAMPLE_RATE) / rate);
      const mono = new Int16Array(outLength);
      for (let i = 0; i < outLength; i++) {
        const src = Math.min(frames - 1, Math.floor((i * rate) / SAMPLE_RATE));
        mono[i] = buf.readInt16LE(pos + 8 + src * 2 * channels);
      }
      return mono;
    }
    pos += 8 + size + (size % 2);
  }
  throw new Error("no data chunk");
}

/** The samples for one video frame starting at timeline time `nowMs`. */
function audioFor(nowMs: number): Buffer {
  const chunk = Buffer.alloc(SAMPLES_PER_FRAME * 2);
  const { segment } = onAir(nowMs);
  if (!segment) return chunk;
  const cur = currentLine(segment, nowMs - Date.parse(segment.startsAt));
  const clip = cur?.line.audio ? clips.get(cur.line.audio) : undefined;
  if (!cur || !(clip instanceof Int16Array)) return chunk;
  const first = Math.floor((cur.lineElapsedMs / 1000) * SAMPLE_RATE);
  for (let i = 0; i < SAMPLES_PER_FRAME; i++) {
    const sample = clip[first + i];
    if (sample === undefined) break;
    chunk.writeInt16LE(sample, i * 2);
  }
  return chunk;
}

// ── Output ──

function ffmpegArgs(): string[] {
  const input = [
    "-hide_banner", "-loglevel", "warning",
    "-thread_queue_size", "512",
    "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${WIDTH}x${HEIGHT}`, "-r", String(FPS), "-i", "pipe:0",
    "-thread_queue_size", "512",
    "-f", "s16le", "-ar", String(SAMPLE_RATE), "-ac", "1", "-i", "pipe:3",
  ];
  const encode = [
    "-vf", "scale=1920:1080:flags=neighbor",
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
    "-b:v", "4500k", "-maxrate", "4500k", "-bufsize", "9000k",
    "-g", String(FPS * 2), "-keyint_min", String(FPS * 2), "-sc_threshold", "0",
    "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
  ];
  if (isRtmp) return [...input, ...encode, "-f", "flv", out!];
  return [...input, ...encode, ...(seconds ? ["-t", String(seconds)] : []), "-y", out!];
}

// ffmpeg reads the two pipes in its own order, so waiting for one to drain
// while it waits on the other deadlocks. Let each run ahead by about a
// second before pausing.
const VIDEO_AHEAD = WIDTH * HEIGHT * 4 * FPS;
const AUDIO_AHEAD = SAMPLES_PER_FRAME * 2 * FPS;

async function writeBoth(video: Writable, frame: Buffer, audio: Writable, samples: Buffer) {
  video.write(frame);
  audio.write(samples);
  while (video.writableLength > VIDEO_AHEAD && audio.writableLength > AUDIO_AHEAD) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  while (video.writableLength > VIDEO_AHEAD * 2 || audio.writableLength > AUDIO_AHEAD * 2) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  await poll();
  await checkIn();
  const pollTimer = setInterval(poll, POLL_MS);
  const checkInTimer = setInterval(checkIn, CHECKIN_MS);

  const ffmpeg = spawn("ffmpeg", ffmpegArgs(), { stdio: ["pipe", "inherit", "inherit", "pipe"] });
  const video = ffmpeg.stdin!;
  const audio = ffmpeg.stdio[3] as Writable;
  let ended = false;
  ffmpeg.on("exit", (code) => {
    ended = true;
    clearInterval(pollTimer);
    clearInterval(checkInTimer);
    console.log(`[stream] ffmpeg exited with code ${code}`);
    process.exitCode = code ?? 1;
  });
  for (const pipe of [video, audio]) pipe.on("error", () => (ended = true));

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  const startWall = Date.now();
  const startTimeline = startWall + offsetMs;
  const totalFrames = seconds ? Math.ceil(seconds * FPS) + FPS : Infinity;
  console.log(`[stream] ${isRtmp ? "streaming" : "recording"} to ${isRtmp ? out!.replace(/[^/]+$/, "****") : out}`);

  for (let frame = 0; frame < totalFrames && !ended; frame++) {
    const nowMs = startTimeline + (frame * 1000) / FPS;
    const { segment, upcoming } = onAir(nowMs);
    drawFrame(ctx as unknown as Parameters<typeof drawFrame>[0], {
      lineup,
      nowMs,
      segment,
      segmentElapsedMs: segment ? nowMs - Date.parse(segment.startsAt) : 0,
      upcoming,
      clockLabel: easternClock(nowMs),
      captions: true,
    });
    const pixels = Buffer.from(ctx.getImageData(0, 0, WIDTH, HEIGHT).data.buffer);
    await writeBoth(video, pixels, audio, audioFor(nowMs));

    // Pace to the wall clock when going out live; a recording runs flat out.
    if (isRtmp) {
      const due = startWall + ((frame + 1) * 1000) / FPS;
      const wait = due - Date.now();
      if (wait > 0) await sleep(wait);
    }
  }

  video.end();
  audio.end();
  clearInterval(pollTimer);
  clearInterval(checkInTimer);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
