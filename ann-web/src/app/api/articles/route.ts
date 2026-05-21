import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis, getCacheKey, CACHE_TTL } from "@/lib/redis";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20")));
  const category = searchParams.get("category");
  const sort = searchParams.get("sort") || "signal";
  const search = searchParams.get("search");

  const cacheKey = getCacheKey("feed", page.toString(), limit.toString(), category || undefined, sort, search || undefined);

  // Try cache first
  if (redis) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }
  }

  try {
    // Public feed: only show articles that have cleared /admin/review.
    // Draft and rejected articles never leak to the public surface.
    const where: Record<string, unknown> = {
      storyStatus: { in: ["approved", "published"] },
    };
    if (category) {
      where.category = category;
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { summary: { contains: search, mode: "insensitive" } },
        { tags: { has: search } },
      ];
    }

    // Build orderBy. signal/trending sort against the joined Scores row;
    // newest is the publish timestamp from the original source.
    let orderBy: Record<string, unknown> = {};
    switch (sort) {
      case "newest":
        orderBy = { publishedAt: "desc" };
        break;
      case "trending":
        orderBy = { scores: { signalScore: "desc" } };
        break;
      case "signal":
      default:
        orderBy = { scores: { overallScore: "desc" } };
        break;
    }

    const [articles, total] = await Promise.all([
      prisma.article.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          scores: true,
        },
      }),
      prisma.article.count({ where }),
    ]);

    const response = {
      articles: articles.map((article) => ({
        id: article.id,
        title: article.title,
        slug: article.slug,
        url: article.url,
        source: article.source,
        sourceUrl: article.sourceUrl,
        author: article.author,
        publishedAt: article.publishedAt.toISOString(),
        summary: article.summary,
        tlDr: article.tlDr,
        tags: article.tags,
        category: article.category,
        scores: article.scores,
        imageUrl: article.imageUrl,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };

    // Cache the response
    if (redis) {
      await redis.set(cacheKey, response, { ex: CACHE_TTL.FEED });
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("Failed to fetch articles:", error);
    return NextResponse.json(
      { error: "Failed to fetch articles" },
      { status: 500 }
    );
  }
}
