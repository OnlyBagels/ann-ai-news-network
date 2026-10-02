-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('models', 'open_source', 'coding_ai', 'agents', 'research', 'security', 'funding', 'regulation');

-- CreateEnum
CREATE TYPE "StoryStatus" AS ENUM ('raw', 'clustered', 'investigating', 'enriched', 'verified', 'edited', 'reviewed', 'approved', 'published', 'rejected', 'needs_human_review');

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "author" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "summary" TEXT NOT NULL,
    "tlDr" TEXT,
    "content" TEXT,
    "tags" TEXT[],
    "category" "Category" NOT NULL,
    "imageUrl" TEXT,
    "relatedArticles" TEXT[],
    "storyStatus" "StoryStatus" NOT NULL DEFAULT 'raw',
    "agentsInvolved" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourcesAnalyzed" INTEGER NOT NULL DEFAULT 0,
    "factCheckStatus" TEXT NOT NULL DEFAULT 'pending',
    "overall_confidence" DOUBLE PRECISION,
    "source_quality" DOUBLE PRECISION,
    "controversy_score" DOUBLE PRECISION,
    "citation_count" INTEGER,
    "verified_claims" INTEGER,
    "unverified_claims" INTEGER,
    "hallucination_risk" DOUBLE PRECISION,
    "risk_level" TEXT DEFAULT 'low',
    "risk_factors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requires_human_review" BOOLEAN NOT NULL DEFAULT false,
    "legal_concerns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bias_concerns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "safety_flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "human_reviewer" TEXT,
    "human_notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "published_at_real" TIMESTAMP(3),

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scores" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "signalScore" INTEGER NOT NULL DEFAULT 0,
    "hypeScore" INTEGER NOT NULL DEFAULT 0,
    "builderScore" INTEGER NOT NULL DEFAULT 0,
    "securityScore" INTEGER NOT NULL DEFAULT 0,
    "openSourceScore" INTEGER NOT NULL DEFAULT 0,
    "enterpriseScore" INTEGER NOT NULL DEFAULT 0,
    "overallScore" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentAction" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "agentRole" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "output" JSONB,
    "error" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "type" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastFetched" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "articleCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastSegment" (
    "id" TEXT NOT NULL,
    "showId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "anchors" TEXT[],
    "articleIds" TEXT[],
    "script" JSONB NOT NULL,
    "writer" TEXT NOT NULL,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BroadcastSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastSpend" (
    "day" TEXT NOT NULL,
    "usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BroadcastSpend_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE "LiveViewer" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'web',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveViewer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Article_slug_key" ON "Article"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Article_url_key" ON "Article"("url");

-- CreateIndex
CREATE UNIQUE INDEX "Scores_articleId_key" ON "Scores"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "Source_name_key" ON "Source"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE INDEX "BroadcastSegment_startsAt_idx" ON "BroadcastSegment"("startsAt");

-- CreateIndex
CREATE INDEX "BroadcastSegment_endsAt_idx" ON "BroadcastSegment"("endsAt");

-- CreateIndex
CREATE INDEX "LiveViewer_lastSeenAt_idx" ON "LiveViewer"("lastSeenAt");

-- AddForeignKey
ALTER TABLE "Scores" ADD CONSTRAINT "Scores_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAction" ADD CONSTRAINT "AgentAction_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

