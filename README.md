# ANN — AI News Network

AI ecosystem intelligence for builders, founders, and operators. No hype. Just signal.

ANN ingests AI models, repos, papers, benchmarks, and news, drafts briefings and explainers through an agent pipeline, scores signal vs. hype, runs review under a human editorial gate, then ships to a website, newsletter, and social channels.

**Status:** active development. End-to-end pipeline runs locally. Source is public; contributions welcome.

---

## Pipeline

```
sources → ingest → normalize → dedupe → summarize → score → review → human gate → publish
```

Sources: RSS, GitHub trending, Hugging Face, arXiv, Hacker News, Reddit. Targets: website, newsletter, social.

---

## Repo layout

Monorepo. Two services.

```
ann-ai-news-network/
├── ann-web/      Next.js frontend + admin UI + API routes
├── ann-agents/   Python agent service (FastAPI)
├── LICENSE
└── README.md
```

### ann-web

Next.js 16.2 (React 19) · TypeScript 5 · Tailwind 4 · shadcn/ui (Radix) · Prisma 6 · TanStack Query · Upstash Redis · Meilisearch client.

```
ann-web/src/
├── app/
│   ├── (public routes)   feed, articles, categories, search, legal pages
│   ├── admin/            sources, review queue, agents dashboard
│   └── api/              articles, sources, ingest, newsletter, admin
├── components/
│   ├── feed/             FeedCard, FeedFilter, FeedList
│   ├── layout/           Header, Sidebar, Ticker
│   └── shared/           SearchBar, NewsletterSignup
└── lib/                  prisma, redis, meilisearch clients
```

Postgres schema in `ann-web/prisma/schema.prisma`.

### ann-agents

Python 3.11+ · FastAPI · async I/O · loguru · pydantic v2 · SQLAlchemy.

```
ann-agents/src/ann_agents/
├── core/         base_agent, config, types
├── llm/          multi-provider router (OpenAI · Anthropic · Gemini)
├── reporters/    beat reporters — model · oss · research · security
│                 · regulation · business
├── research/     deep research agent
├── factcheck/    claim decomposition + verification
├── editorial/    editorial review agents
├── oversight/    gate + governance
├── pipeline/     end-to-end orchestrator
├── ingestion/    source ingestion
├── bridge/       Postgres (SQLAlchemy), Meilisearch, scheduler
└── api/          FastAPI service
```

Ingestion: feedparser · BeautifulSoup · lxml · arxiv · PRAW · huggingface-hub · githubkit · newspaper4k · trafilatura.

---

## ANN Live

A 24-hour channel streamed to YouTube and embedded on the site: on the front page and, with the transcript, schedule and links to each story on air, at `/live`. Pixel-art anchors read the AI news from stories the pipeline has approved. There is one timeline, so everyone watching sees the same line at the same moment.

**How a segment is made** (`ann-agents/src/ann_agents/broadcast/`)

1. The director (`director.py`) checks who is watching and what the grid in `ann-web/src/broadcast/lineup.json` says is on air. It then picks the next approved story for that show that hasn't aired in the last 6 hours.
2. `facts.py` builds a numbered fact sheet from the article's own title, TL;DR and summary.
3. Claude writes the dialogue as structured lines, and each line lists the facts it relies on (`writer.py`). Routine stories go to `claude-haiku-4-5`; stories scoring 80 or more go to `claude-sonnet-5-5`.
4. `standards.py` cuts lines in code: a figure that isn't in the facts the line cites, a spelled-out figure, a quote that isn't verbatim, a URL, or a speaker who isn't at the desk. Next, `claude-sonnet-5-5` reviews the remaining lines against the fact sheet. If more than a third of the script is cut, the story airs as a straight headline read from the article (`reel.py`). Cut lines stay in the database with their reasons.
5. Piper voices each line locally (`tts.py`). The clip length sets the timing, and its loudness drives the anchors' mouths. Without voices, lines are timed from their word count and shown as captions.
6. The segment is appended to the timeline in Postgres (`BroadcastSegment`).

Each show opens with a short intro at the top of its slot.

**Cost controls**

- Nothing is written while nobody is watching. Browsers on `/live` and the streamer check in, and the director stops writing once no one has checked in within `BROADCAST_VIEWER_WINDOW_SECONDS`.
- Claude spend is tracked per UTC day in `BroadcastSpend`. When `BROADCAST_DAILY_BUDGET_USD` is used up, the channel switches to headline reads, which cost nothing.
- The director only writes `BROADCAST_LOOKAHEAD_SECONDS` ahead of air.

**Rendering.** `ann-web/src/broadcast/scene.ts` draws a 320x180 frame using only `fillRect`. The web player (`src/components/live/LivePlayer.tsx`) and the streamer (`scripts/stream.ts`) both use it, so the site and YouTube show the same picture.

### Running it

You need the newsroom (above) producing approved stories, plus three processes:

```bash
# 1. the site, which serves /live and the timeline API
cd ann-web && npm run build && npm run start

# 2. the director, which keeps the timeline filled
cd ann-agents && python -m ann_agents.broadcast

# 3. the streamer, which sends the channel to YouTube Live
cd ann-web && YOUTUBE_STREAM_KEY=xxxx npx tsx scripts/stream.ts
```

- Set `ANTHROPIC_API_KEY` in `ann-agents/.env`. Without it, the channel airs headline reads only.
- The YouTube stream key comes from YouTube Studio, under Go live, then Stream. The streamer sends 1080p30 H.264 with AAC audio. It needs `ffmpeg` on the PATH.
- To embed the stream on the site, set `YOUTUBE_CHANNEL_ID` (your channel's `UC...` id) in `ann-web/.env.local`, or `YOUTUBE_VIDEO_ID` for one live video. YouTube runs 15 to 30 seconds behind real time, so the transcript and "on air" panel wait `YOUTUBE_DELAY_SECONDS` (default 20) to match the picture. With neither set, the site draws the channel itself from the timeline.
- To check the output without going live, record a file instead: `npx tsx scripts/stream.ts --out test.mp4 --seconds 30`.

**Voices.** Install Piper with `pip install piper-tts`. Then download the four voices named in `lineup.json` from [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices) into `voices/`. You need both the `.onnx` and the `.onnx.json` file for each voice. Then set these in `ann-agents/.env`:

```
BROADCAST_TTS=piper
BROADCAST_PIPER_VOICES_DIR=/abs/path/voices
BROADCAST_AUDIO_DIR=/abs/path/broadcast-audio
```

Set the same `BROADCAST_AUDIO_DIR` in `ann-web/.env.local`.

**Changing the lineup.** Edit `ann-web/src/broadcast/lineup.json`, which holds the anchors (look, voice, persona), the shows (anchors, categories, set colour) and the 24-hour grid in UTC. To preview the set, run `npx tsx scripts/render-preview.ts`, which writes frames to `ann-web/.preview/`.

### Tests

```bash
cd ann-web && DATABASE_URL=postgresql://.../ann_test npx prisma db push
cd ann-agents && pip install -e ".[dev]" && TEST_DATABASE_URL=postgresql://.../ann_test pytest
```

The database tests truncate every table, so point `TEST_DATABASE_URL` at a separate database.

---

## Running locally

You bring the infra (Postgres, Redis, Meilisearch) and the API keys.

```bash
git clone https://github.com/OnlyBagels/ann-ai-news-network.git
cd ann-ai-news-network

# frontend
cd ann-web
cp .env.template .env.local           # fill in DATABASE_URL, REDIS_URL, MEILI_HOST
npm install
npx prisma generate
npx prisma migrate dev
npm run dev                           # http://localhost:3000

# agents (separate shell)
cd ann-agents
cp .env.template .env                 # fill in provider keys + DATABASE_URL
pip install -e .
python -m ann_agents.main
```

Postgres 16+, Redis 7+, Meilisearch v1.12+ recommended.

---

## Branches

- **`main`** — production
- **`dev`** — integration

PRs target `main`. Feature branches off `dev`.

---

## Commit messages

The repo ships a `/commit` skill at [.claude/skills/commit/SKILL.md](.claude/skills/commit/SKILL.md). Run it from Claude Code in this repo to get drafted commit messages that pass the anti-AI-slop rules.

Writing by hand? Rules in one paragraph: imperative mood, lowercase, no trailing period, 50-char subject, 72-char body wrap, explain *why* not *what*, skip `leverages`/`utilizes`/`comprehensive`/`robust`/`seamless`/`this commit`/chatbot openers/marketing words.

---

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 Faction Community, LLC.

---

## Contributing

Issues and PRs welcome. Use `/commit` (or follow the rules above) for commit messages. Match the conventions in each service: ESLint defaults in `ann-web/`, idiomatic FastAPI + pydantic in `ann-agents/`.
