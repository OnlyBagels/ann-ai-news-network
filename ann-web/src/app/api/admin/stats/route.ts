import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/stats
 * Returns system health and pipeline statistics
 */
export async function GET() {
  try {
    const [
      totalArticles,
      publishedArticles,
      pendingReview,
      rejectedArticles,
      totalSources,
      recentActions,
    ] = await Promise.all([
      prisma.article.count(),
      prisma.article.count({
        where: { storyStatus: { in: ["approved", "published"] } },
      }),
      prisma.article.count({
        where: {
          OR: [
            { storyStatus: "needs_human_review" },
            { requiresHumanReview: true },
          ],
        },
      }),
      prisma.article.count({
        where: { storyStatus: "rejected" },
      }),
      prisma.source.count({ where: { isActive: true } }),
      prisma.agentAction.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          agentRole: true,
          state: true,
          durationMs: true,
          error: true,
          createdAt: true,
        },
      }),
    ]);

    // Category breakdown
    const categoryBreakdown = await prisma.article.groupBy({
      by: ["category"],
      _count: true,
      where: { storyStatus: { in: ["approved", "published"] } },
    });

    // Average scores
    const avgScores = await prisma.scores.aggregate({
      _avg: {
        signalScore: true,
        hypeScore: true,
        builderScore: true,
        securityScore: true,
        openSourceScore: true,
        enterpriseScore: true,
        overallScore: true,
      },
    });

    return NextResponse.json({
      articles: {
        total: totalArticles,
        published: publishedArticles,
        pendingReview,
        rejected: rejectedArticles,
      },
      sources: {
        active: totalSources,
      },
      scores: {
        avgSignal: Math.round(avgScores._avg.signalScore ?? 0),
        avgHype: Math.round(avgScores._avg.hypeScore ?? 0),
        avgBuilder: Math.round(avgScores._avg.builderScore ?? 0),
        avgSecurity: Math.round(avgScores._avg.securityScore ?? 0),
        avgOpenSource: Math.round(avgScores._avg.openSourceScore ?? 0),
        avgEnterprise: Math.round(avgScores._avg.enterpriseScore ?? 0),
        avgOverall: Math.round(avgScores._avg.overallScore ?? 0),
      },
      categories: categoryBreakdown.map((c) => ({
        category: c.category,
        count: c._count,
      })),
      recentActions: recentActions.map((a) => ({
        agentRole: a.agentRole,
        state: a.state,
        durationMs: a.durationMs,
        error: a.error,
        createdAt: a.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Failed to fetch admin stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch admin stats" },
      { status: 500 }
    );
  }
}
