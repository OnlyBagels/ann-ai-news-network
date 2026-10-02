import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis, getCacheKey, CACHE_TTL } from "@/lib/redis";
import { PUBLIC_STATUSES, toArticle, toDbCategory } from "@/lib/articles";
import type { Prisma } from "@prisma/client";

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
    // Build query filters
    const where: Prisma.ArticleWhereInput = { storyStatus: { in: PUBLIC_STATUSES } };
    if (category) {
      const dbCategory = toDbCategory(category);
      if (!dbCategory) {
        return NextResponse.json({ error: "Unknown category" }, { status: 400 });
      }
      where.category = dbCategory;
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { summary: { contains: search, mode: "insensitive" } },
        { tags: { has: search } },
      ];
    }

    // Build orderBy
    // Scores live on a related row, so rank through the relation.
    let orderBy: Prisma.ArticleOrderByWithRelationInput[];
    switch (sort) {
      case "newest":
        orderBy = [{ publishedAt: "desc" }];
        break;
      case "trending":
        orderBy = [{ scores: { signalScore: "desc" } }, { publishedAt: "desc" }];
        break;
      case "signal":
      default:
        orderBy = [{ scores: { overallScore: "desc" } }, { publishedAt: "desc" }];
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
      // The feed leaves out full article bodies.
      articles: articles.map((article) => ({ ...toArticle(article), content: undefined })),
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
