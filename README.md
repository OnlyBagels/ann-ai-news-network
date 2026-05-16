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
