import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminApi } from "@/lib/auth/server";

/**
 * GET /api/admin/review
 * Returns articles needing human review (risk flags, low confidence, etc.)
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdminApi(req);
  if (auth.response) return auth.response;

  try {
    const articles = await prisma.article.findMany({
      where: {
        OR: [
          { storyStatus: "needs_human_review" },
          { requiresHumanReview: true },
        ],
      },
      orderBy: [
        { hallucinationRisk: "desc" },
        { createdAt: "desc" },
      ],
      take: 50,
      include: {
        scores: true,
        agentActions: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    return NextResponse.json({
      articles: articles.map((a) => ({
        id: a.id,
        title: a.title,
        slug: a.slug,
        url: a.url,
        source: a.source,
        sourceUrl: a.sourceUrl,
        author: a.author,
        publishedAt: a.publishedAt.toISOString(),
        summary: a.summary,
        tlDr: a.tlDr,
        content: a.content,
        tags: a.tags,
        category: a.category,
        section: a.section,
        region: a.region,
        country: a.country,
        storyStatus: a.storyStatus,
        sourcesAnalyzed: a.sourcesAnalyzed,
        riskLevel: a.riskLevel,
        requiresHumanReview: a.requiresHumanReview,
        overallConfidence: a.overallConfidence,
        hallucinationRisk: a.hallucinationRisk,
        riskFactors: a.riskFactors,
        legalConcerns: a.legalConcerns,
        biasConcerns: a.biasConcerns,
        safetyFlags: a.safetyFlags,
        scores: a.scores,
        agentActions: a.agentActions.map((act) => ({
          agentRole: act.agentRole,
          state: act.state,
          durationMs: act.durationMs,
          error: act.error,
          completedAt: act.completedAt?.toISOString(),
        })),
        createdAt: a.createdAt.toISOString(),
      })),
      total: articles.length,
    });
  } catch (error) {
    console.error("Failed to fetch review queue:", error);
    return NextResponse.json(
      { error: "Failed to fetch review queue" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/review
 * Approve or reject an article
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const { articleId, action, notes } = body;

    if (!articleId || !action) {
      return NextResponse.json(
        { error: "articleId and action are required" },
        { status: 400 }
      );
    }

    if (action === "approve") {
      await prisma.article.update({
        where: { id: articleId },
        data: {
          storyStatus: "approved",
          humanReviewer: auth.user.email,
          publishedAtReal: new Date(),
        },
      });
      return NextResponse.json({ success: true, status: "approved" });
    }

    if (action === "reject") {
      await prisma.article.update({
        where: { id: articleId },
        data: {
          storyStatus: "rejected",
          humanNotes: notes || "",
        },
      });
      return NextResponse.json({ success: true, status: "rejected" });
    }

    return NextResponse.json(
      { error: `Unknown action: ${action}` },
      { status: 400 }
    );
  } catch (error) {
    console.error("Failed to process review action:", error);
    return NextResponse.json(
      { error: "Failed to process review action" },
      { status: 500 }
    );
  }
}
