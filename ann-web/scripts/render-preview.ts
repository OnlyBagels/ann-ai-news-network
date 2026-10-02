// Dev preview for the broadcast renderer.
//
//   npx tsx scripts/render-preview.ts
//
// Renders sample frames with @napi-rs/canvas, scales them 4x nearest-neighbour
// and writes PNGs to .preview/. The segments below are PREVIEW FIXTURES with
// made-up headlines and sources; they exist only to exercise the layout.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createCanvas, type Canvas } from "@napi-rs/canvas";

import lineupJson from "../src/broadcast/lineup.json";
import type { Lineup, Segment } from "../src/broadcast/types";
import { HEIGHT, WIDTH, drawFrame, type FrameInput } from "../src/broadcast/scene";
import { drawText, drawTextScaled, LINE_HEIGHT, normalizeText } from "../src/broadcast/font";
import { drawAnchor, SPRITE_W, SPRITE_H } from "../src/broadcast/sprites";
import { expressionPose } from "../src/broadcast/face";
import { MOODS } from "../src/broadcast/types";

const lineup = lineupJson as Lineup;
const OUT = join(__dirname, "..", ".preview");
const SCALE = 4;
mkdirSync(OUT, { recursive: true });

const T0 = Date.UTC(2026, 9, 2, 14, 5, 0);

function line(speaker: string, text: string, startMs: number, durationMs: number, mouth?: number[]) {
  return { speaker, text, startMs, durationMs, mouth: mouth ?? null };
}

// --- preview fixtures (not real news) -------------------------------------
const wire: Segment = {
  id: "fixture-wire-1",
  showId: "the-wire",
  kind: "story",
  startsAt: new Date(T0).toISOString(),
  durationMs: 40000,
  title: "Preview fixture: a lab ships a smaller model with a longer context window",
  anchors: ["marla", "oscar"],
  articles: [{ id: "a1", title: "fixture", source: "Example Wire", url: "https://example.com/a1" }],
  lines: [
    line("marla", "Good afternoon. A lab shipped a smaller model today, and the pricing page changed before the blog post did.", 0, 7000),
    line("oscar", "I ran my three test prompts on it. It's quick, and the context window is genuinely longer — not just on paper.", 7400, 7600),
    line("marla", "So who should switch?", 15400, 1800),
  ],
};

const paper: Segment = {
  id: "fixture-paper-1",
  showId: "paper-trail",
  kind: "story",
  startsAt: new Date(T0).toISOString(),
  durationMs: 20000,
  title: "Preview fixture: a preprint on retrieval reports gains on a single benchmark",
  anchors: ["juno"],
  articles: [{ id: "a2", title: "fixture", source: "Example Preprints", url: "https://example.com/a2" }],
  lines: [line("juno", "One benchmark, one setup. The method is simple: retrieve first, then let the model check its own citations.", 0, 8000)],
};

const rulebook: Segment = {
  id: "fixture-rulebook-1",
  showId: "rulebook",
  kind: "story",
  startsAt: new Date(T0).toISOString(),
  durationMs: 30000,
  title:
    "Preview fixture: a regulator publishes draft guidance for general-purpose models, with a comment period and a long list of reporting duties that builders will need to read closely",
  anchors: ["rhett", "juno"],
  articles: [{ id: "a3", title: "fixture", source: "Example Policy Desk", url: "https://example.com/a3" }],
  lines: [
    // with a recorded mouth envelope (15 fps)
    line(
      "rhett",
      "Here's who is affected and what to do on Monday: read section four, then check which of your models count as general purpose.",
      0,
      9000,
      Array.from({ length: 135 }, (_, i) => Math.abs(Math.sin(i * 0.9)) * (i % 7 === 0 ? 0 : 1)),
    ),
    line("juno", "And the definitions section is where the real arguments will be.", 9500, 4000),
  ],
};

const redteam: Segment = {
  id: "fixture-red-1",
  showId: "red-team",
  kind: "story",
  startsAt: new Date(T0).toISOString(),
  durationMs: 30000,
  title: "Preview fixture: a prompt-injection bug in a coding agent gets a patch",
  anchors: ["rhett", "oscar"],
  articles: [{ id: "a4", title: "fixture", source: "Example Security Blog", url: "https://example.com/a4" }],
  lines: [
    line("oscar", "We patched it the same week.", 0, 2500),
    line("rhett", "You patched it eleven days later, Oscar.", 3000, 3000),
  ],
};

const ident: Segment = {
  id: "fixture-ident-1",
  showId: "model-watch",
  kind: "ident",
  startsAt: new Date(T0).toISOString(),
  durationMs: 8000,
  title: "Model Watch",
  anchors: ["oscar", "marla"],
  articles: [],
  lines: [line("oscar", "This is Model Watch.", 500, 2000)],
};

const ledgerNext: Segment = { ...wire, id: "fixture-ledger", showId: "the-ledger", title: "Preview fixture: a compute deal, read line by line" };
const upcoming: Segment[] = [paper, rulebook, ledgerNext];

// --------------------------------------------------------------------------

function scaled(src: Canvas, scale: number): Buffer {
  const out = createCanvas(src.width * scale, src.height * scale);
  const octx = out.getContext("2d");
  octx.imageSmoothingEnabled = false;
  octx.drawImage(src, 0, 0, src.width * scale, src.height * scale);
  return out.toBuffer("image/png");
}

function frame(name: string, input: Partial<FrameInput> & { segment: Segment | null }): void {
  const c = createCanvas(WIDTH, HEIGHT);
  const ctx = c.getContext("2d");
  drawFrame(ctx, {
    lineup,
    nowMs: T0,
    segmentElapsedMs: 0,
    upcoming,
    clockLabel: "14:05 UTC",
    captions: true,
    ...input,
  });
  const file = join(OUT, `${name}.png`);
  writeFileSync(file, scaled(c, SCALE));
  console.log("wrote", file);
}

// Pick an elapsed time where the fallback mouth is open (a vowel).
frame("01-wire-marla-speaking", { segment: wire, segmentElapsedMs: 2100, nowMs: T0 + 2100 });
frame("02-wire-oscar-speaking", { segment: wire, segmentElapsedMs: 9050, nowMs: T0 + 9050 });
frame("03-paper-single-anchor", { segment: paper, segmentElapsedMs: 5200, nowMs: T0 + 5200, captions: true });
frame("04-rulebook-long-title", { segment: rulebook, segmentElapsedMs: 4200, nowMs: T0 + 4200 });
frame("05-redteam-no-captions", { segment: redteam, segmentElapsedMs: 3600, nowMs: T0 + 3600, captions: false });
frame("06-ident-model-watch", { segment: ident, segmentElapsedMs: 900, nowMs: T0 + 900 });
frame("07-standby-next-up", { segment: null, nowMs: T0 });
frame("08-standby-back-shortly", { segment: null, nowMs: T0, upcoming: [] });
frame("09-wire-gap-ticker-grid", { segment: wire, segmentElapsedMs: 7200, nowMs: T0 + 7200, upcoming: [] });

// --- font sheet -------------------------------------------------------------
{
  const c = createCanvas(WIDTH, 150);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#14161c";
  ctx.fillRect(0, 0, WIDTH, 150);
  let chars = "";
  for (let i = 32; i <= 126; i++) chars += String.fromCharCode(i);
  let y = 4;
  for (let i = 0; i < chars.length; i += 50) {
    drawText(ctx, chars.slice(i, i + 50), 4, y, "#f2efe8");
    y += LINE_HEIGHT;
  }
  y += 4;
  const samples = [
    "The quick brown fox jumps over the lazy dog.",
    "THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG!",
    "Sphinx of black quartz, judge my vow? 0123456789",
    "pygmy jugs; quaint glyphs (yep) {x} [y] <z> $5 & 10%",
    normalizeText("“Smart” quotes — dash, café naïve über… \u{1F680}"),
  ];
  for (const s of samples) {
    drawText(ctx, s, 4, y, "#f2efe8");
    y += LINE_HEIGHT;
  }
  y += 3;
  ctx.fillStyle = "#f2efe8";
  ctx.fillRect(0, y, WIDTH, 30);
  drawText(ctx, "Dark on paper: lower third text, 12:45 UTC", 4, y + 3, "#121417");
  drawTextScaled(ctx, "2x Model Watch 14:05", 4, y + 13, "#121417", 2);
  writeFileSync(join(OUT, "font-sheet.png"), scaled(c, SCALE));
  console.log("wrote", join(OUT, "font-sheet.png"));
}

// --- anchor sheet: every anchor in every mood, resting and talking ----------
{
  const cols = MOODS.length;
  const w = cols * (SPRITE_W + 4) + 4;
  const h = lineup.anchors.length * 2 * (SPRITE_H + 4) + 4;
  const c = createCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#5b6b84";
  ctx.fillRect(0, 0, w, h);
  // Each anchor in every mood: resting face on top, talking face below.
  lineup.anchors.forEach((a, row) => {
    MOODS.forEach((mood, col) => {
      drawAnchor(ctx, a.look, expressionPose(mood, false), 4 + col * (SPRITE_W + 4), 4 + row * 2 * (SPRITE_H + 4));
      drawAnchor(ctx, a.look, expressionPose(mood, true), 4 + col * (SPRITE_W + 4), 4 + (row * 2 + 1) * (SPRITE_H + 4));
    });
  });
  writeFileSync(join(OUT, "anchor-sheet.png"), scaled(c, SCALE));
  console.log("wrote", join(OUT, "anchor-sheet.png"));
}

// --- timing ----------------------------------------------------------------
{
  const c = createCanvas(WIDTH, HEIGHT);
  const ctx = c.getContext("2d");
  const n = 300;
  const t = performance.now();
  for (let i = 0; i < n; i++) {
    drawFrame(ctx, {
      lineup,
      nowMs: T0 + i * 33,
      segment: wire,
      segmentElapsedMs: i * 33,
      upcoming,
      clockLabel: "14:05 UTC",
      captions: true,
    });
  }
  const per = (performance.now() - t) / n;
  console.log(`drawFrame: ${per.toFixed(2)} ms/frame over ${n} frames`);
}
