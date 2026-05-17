# CLAUDE.md — guide for AI assistants working in this repo

This file is read by Claude Code and compatible AI agents. Read it before
making changes. The [README](README.md) is the user-facing summary; this
is the contributor-facing one.

## What this is

A monorepo with two services:

- `ann-web/` — Next.js 16 frontend + admin UI + API routes (TypeScript)
- `ann-agents/` — Python 3.11+ agent service (FastAPI + asyncio)

Pipeline: ingestion → 6 reporter agents → research → fact-check → 4
editorial agents → 4 oversight agents → publisher → admin review queue
→ human approve/reject → public feed.

## Branch workflow

- **`main`** — production. CI deploys to Cloudflare Pages on push.
- **`dev`** — integration. Everything lands here first.

Rules:

- Do not commit directly to `main`. PR `dev` → `main` for releases.
- Push to `dev` often. Small, focused commits beat big batched ones.
- Run `/commit` for each commit. The skill at
  [.claude/skills/commit/SKILL.md](.claude/skills/commit/SKILL.md)
  enforces the anti-slop rules.

When you start a session, expect to be on `dev`. If `git status` shows
`main`, switch with `git checkout dev` before making changes.

## House voice — the writing rules

ANN's audience smells AI slop from a mile away. Two layers enforce
the rules:

1. **Commit messages** — [.claude/skills/commit/SKILL.md](.claude/skills/commit/SKILL.md)
   is the canonical reference. Imperative mood, specific verbs,
   50-char subject, 72-char body wrap, no banned phrases (`leverages`,
   `comprehensive`, `seamless`, `this commit`, etc.).

2. **Article content** — `ann-agents/src/ann_agents/core/voice.py`
   is the canonical reference. Every agent that produces user-facing
   text wraps its role prompt with `apply_voice()`. Same banned
   phrases plus anti-patterns (significance inflation, vague
   attribution, synonym cycling, false ranges) and headline rules.

When adding a new content-generating agent, you must call
`apply_voice(role_prompt)` in the system prompt. The `StyleEditor`
catches drift at the de-slop stage, but prevention is the wrapper.

## Agent → admin queue flow

```
StoryPipeline.run_full_pipeline(story)
    → reporters (6) → research → factcheck
    → editorial (4) → oversight (4)
    → EditorInChief
    → publisher.publish(story)  ─── POST /api/agents/draft on ann-web
        → ann-web upserts Article (storyStatus=needs_human_review)
        → admin queue (/admin/review) polls every 15s
        → human clicks Approve or Reject
```

- Publisher: `ann-agents/src/ann_agents/bridge/publisher.py`
- Endpoint: `ann-web/src/app/api/agents/draft/route.ts`
- Idempotency key: `story.url` (or `ann://internal/{id}` when no URL)
- Auth: `ANN_AGENT_SECRET` env var on both sides, sent as
  `X-Agent-Secret` header. Unset = auth skipped (dev only).

## Private working-tree items (gitignored)

Things that exist on disk but are not in `git ls-files`:

- `00-*.md` … `12-*.md` — strategy and research docs
- `implementation_plan.md` — earlier internal plan
- `ANN_policy_pack/` — legal / policy pack
- `memory/` — local Claude Code project memory
- All `Dockerfile`, `docker-compose*.yml`, `nginx/` — deploy infra
- `.github/` — CI workflows
- Everything in `.claude/` except `skills/commit/`
- Service-level docs in `ann-web/` and `ann-agents/` (root README is
  the only doc)
- Scratch files (`idk*.md`, `scratch*.md`, `tmp*.md`)

If you want to commit something on this list, ask first. The repo is
intentionally minimal on GitHub.

## Service-specific notes

### ann-web

- Next.js 16.2 (React 19). Behavior differs from earlier majors —
  check `node_modules/next/dist/docs/` rather than trusting memory.
- Prisma 6 schema at `prisma/schema.prisma`. Run `npx prisma generate`
  after schema changes; the build fails without it.
- Admin pages under `src/app/admin/`. The review queue at
  `/admin/review` is the destination for every agent draft.
- Redis client is `@upstash/redis` (HTTPS, not TCP). Optional — if
  `REDIS_URL` is unset, lookups fall through to Postgres.

### ann-agents

- Python 3.11+, FastAPI for HTTP, async I/O end-to-end.
- LLM access goes through `llm/router.py`. Pick an `LLMTier`; the
  router resolves to OpenAI / Anthropic / Gemini / DeepSeek / Grok
  based on which API keys are configured.
- All content-generating agents (reporters + editorials) wrap their
  prompts with `apply_voice()` from `core/voice.py`. Required for new
  agents too.
- `bridge/` holds the IO layer — Postgres (SQLAlchemy), Meilisearch,
  scheduler, publisher.

## Common tasks

- **Add a new reporter agent**: subclass `BaseAgent`, register in
  `pipeline/story_pipeline.py` under `self.reporters`, wrap the
  system prompt with `apply_voice()`.
- **Add a new admin endpoint**: create
  `ann-web/src/app/api/admin/<name>/route.ts`, import `prisma` from
  `@/lib/prisma`. The admin UI polls every 15s; no socket plumbing
  needed for v1.
- **Schedule recurring work**: `bridge/scheduler.py`.
- **Tweak the voice rules**: update `core/voice.py` AND
  `.claude/skills/commit/SKILL.md` together — they should agree on the
  banned-phrases list.

## Don't

- Don't commit `.env*` files (except `.env.template` / `.env.example`).
- Don't add Docker / nginx / CI changes to commits intended for the
  public repo — all gitignored on purpose.
- Don't bypass the human gate. Every published article passes through
  `/admin/review`.
- Don't seed the house voice from LLM output. Hand-write exemplar
  articles first; the de-slop pass catches drift, it doesn't establish
  voice from nothing.

---

Repo: https://github.com/OnlyBagels/ann-ai-news-network · MIT · © 2026 Faction Community, LLC
