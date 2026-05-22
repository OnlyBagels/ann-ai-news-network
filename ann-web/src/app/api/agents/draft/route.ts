import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/agents/draft
 *
 * Receives a finished Story payload from the Python agent service
 * (ann-agents) and upserts it into the admin review queue.
 *
 * Idempotency key: payload.story.url (or ann://internal/{id} when there
 * is no external URL). Resending the same story updates the existing
 * row rather than creating a duplicate.
 *
 * Auth: requires the X-Agent-Secret header to match the ANN_AGENT_SECRET
 * env var. If ANN_AGENT_SECRET is unset, auth is skipped (dev convenience
 * only — set the var in any non-local environment).
 */

const VALID_CATEGORIES = [
  "models",
  "open_source",
  "coding_ai",
  "agents",
  "research",
  "security",
  "funding",
  "regulation",
] as const;

const VALID_STATUSES = [
  "raw",
  "clustered",
  "investigating",
  "enriched",
  "verified",
  "edited",
  "reviewed",
  "approved",
  "published",
  "rejected",
  "needs_human_review",
] as const;

interface DraftStory {
  id?: string;
  title: string;
  slug?: string;
  url?: string;
  summary?: string;
  tlDr?: string | null;
  content?: string | null;
  tags?: string[];
  category?: string;
  section?: string;
  region?: string;
  subCategory?: string;
  source?: string;
  sourceUrl?: string | null;
  author?: string | null;
  publishedAt?: string;
  headline?: string | null;
  storyStatus?: string;
  humanReviewer?: string | null;
  humanNotes?: string | null;
  agentsInvolved?: string[];
  sourcesAnalyzed?: number;
  factCheckStatus?: string;
  confidence?: {
    overallConfidence?: number | null;
    sourceQuality?: number | null;
    controversyScore?: number | null;
    citationCount?: number | null;
    verifiedClaims?: number | null;
    unverifiedClaims?: number | null;
    hallucinationRisk?: number | null;
  };
  scores?: {
    signalScore?: number;
    hypeScore?: number;
    builderScore?: number;
    securityScore?: number;
    openSourceScore?: number;
    enterpriseScore?: number;
    overallScore?: number;
  };
  risk?: {
    riskLevel?: string;
    riskFactors?: string[];
    requiresHumanReview?: boolean;
    legalConcerns?: string[];
    biasConcerns?: string[];
    safetyFlags?: string[];
  };
  agentActions?: Array<{
    agentRole: string;
    state?: string;
    startedAt?: string | null;
    completedAt?: string | null;
    output?: unknown;
    error?: string | null;
    durationMs?: number | null;
  }>;
}

interface DraftPayload {
  story: DraftStory;
}

function sanitizeCategory(c: string | undefined): (typeof VALID_CATEGORIES)[number] {
  if (c && (VALID_CATEGORIES as readonly string[]).includes(c)) {
    return c as (typeof VALID_CATEGORIES)[number];
  }
  return "models";
}

function sanitizeStatus(s: string | undefined): (typeof VALID_STATUSES)[number] {
  if (s && (VALID_STATUSES as readonly string[]).includes(s)) {
    return s as (typeof VALID_STATUSES)[number];
  }
  return "needs_human_review";
}

const VALID_SECTIONS = [
  "world", "politics", "business", "tech", "science",
  "climate", "health", "sports", "culture", "opinion",
] as const;
const VALID_REGIONS = [
  "us", "eu", "uk", "asia", "africa", "me", "latam", "oceania",
  "ru", "ua", "cn", "jp", "global",
] as const;

function sanitizeSection(s: string | undefined): string {
  return s && (VALID_SECTIONS as readonly string[]).includes(s) ? s : "tech";
}
function sanitizeRegion(s: string | undefined): string {
  return s && (VALID_REGIONS as readonly string[]).includes(s) ? s : "global";
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function POST(req: NextRequest) {
  const expectedSecret = process.env.ANN_AGENT_SECRET || "";
  if (expectedSecret) {
    const header = req.headers.get("x-agent-secret") || "";
    if (header !== expectedSecret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  let body: DraftPayload;
  try {
    body = (await req.json()) as DraftPayload;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const s = body?.story;
  if (!s?.title) {
    return NextResponse.json(
      { error: "story.title is required" },
      { status: 400 }
    );
  }

  const url = s.url || `ann://internal/${s.id || slugify(s.title)}`;
  const slug =
    s.slug || `${slugify(s.title)}-${(s.id || Date.now().toString()).slice(-6)}`;
  const category = sanitizeCategory(s.category);
  const section = sanitizeSection(s.section);
  const region = sanitizeRegion(s.region);
  const storyStatus = sanitizeStatus(s.storyStatus);
  const publishedAt = s.publishedAt ? new Date(s.publishedAt) : new Date();

  const articleFields = {
    title: s.title,
    summary: s.summary || "",
    tlDr: s.tlDr ?? null,
    content: s.content ?? null,
    tags: s.tags || [],
    category,
    section,
    region,
    subCategory: s.subCategory ?? null,
    storyStatus,
    agentsInvolved: s.agentsInvolved || [],
    sourcesAnalyzed: s.sourcesAnalyzed || 0,
    factCheckStatus: s.factCheckStatus || "pending",
    humanReviewer: s.humanReviewer ?? null,
    humanNotes: s.humanNotes ?? null,
    overallConfidence: s.confidence?.overallConfidence ?? null,
    sourceQuality: s.confidence?.sourceQuality ?? null,
    controversyScore: s.confidence?.controversyScore ?? null,
    citationCount: s.confidence?.citationCount ?? null,
    verifiedClaims: s.confidence?.verifiedClaims ?? null,
    unverifiedClaims: s.confidence?.unverifiedClaims ?? null,
    hallucinationRisk: s.confidence?.hallucinationRisk ?? null,
    riskLevel: s.risk?.riskLevel || "low",
    riskFactors: s.risk?.riskFactors || [],
    requiresHumanReview:
      s.risk?.requiresHumanReview ?? storyStatus === "needs_human_review",
    legalConcerns: s.risk?.legalConcerns || [],
    biasConcerns: s.risk?.biasConcerns || [],
    safetyFlags: s.risk?.safetyFlags || [],
  };

  try {
    const article = await prisma.article.upsert({
      where: { url },
      create: {
        ...articleFields,
        url,
        slug,
        source: s.source || "agent",
        sourceUrl: s.sourceUrl ?? null,
        author: s.author ?? null,
        publishedAt,
      },
      update: articleFields,
    });

    if (s.scores) {
      const scoresFields = {
        signalScore: s.scores.signalScore ?? 0,
        hypeScore: s.scores.hypeScore ?? 0,
        builderScore: s.scores.builderScore ?? 0,
        securityScore: s.scores.securityScore ?? 0,
        openSourceScore: s.scores.openSourceScore ?? 0,
        enterpriseScore: s.scores.enterpriseScore ?? 0,
        overallScore: s.scores.overallScore ?? 0,
      };
      await prisma.scores.upsert({
        where: { articleId: article.id },
        create: { articleId: article.id, ...scoresFields },
        update: scoresFields,
      });
    }

    if (s.agentActions && s.agentActions.length > 0) {
      await prisma.agentAction.deleteMany({ where: { articleId: article.id } });
      await prisma.agentAction.createMany({
        data: s.agentActions.map((a) => ({
          articleId: article.id,
          agentRole: a.agentRole,
          state: a.state || "completed",
          startedAt: a.startedAt ? new Date(a.startedAt) : null,
          completedAt: a.completedAt ? new Date(a.completedAt) : null,
          // Prisma's Json type accepts arbitrary JS values; the cast keeps
          // TS happy without losing fidelity at runtime.
          output: (a.output as never) ?? undefined,
          error: a.error ?? null,
          durationMs: a.durationMs ?? null,
        })),
      });
    }

    return NextResponse.json({
      articleId: article.id,
      slug: article.slug,
      url: article.url,
      status: article.storyStatus,
    });
  } catch (err) {
    console.error("draft publish failed:", err);
    return NextResponse.json(
      { error: "failed to publish draft", detail: String(err) },
      { status: 500 }
    );
  }
}
