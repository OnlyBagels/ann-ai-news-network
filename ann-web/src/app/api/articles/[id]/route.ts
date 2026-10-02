import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis, getCacheKey, CACHE_TTL } from "@/lib/redis";
import { PUBLIC_STATUSES, toArticle } from "@/lib/articles";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cacheKey = getCacheKey("article", id);

  // Try cache first
  if (redis) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }
  }

  try {
    const article = await prisma.article.findFirst({
      where: { id, storyStatus: { in: PUBLIC_STATUSES } },
      include: {
        scores: true,
      },
    });

    if (!article) {
      return NextResponse.json(
        { error: "Article not found" },
        { status: 404 }
      );
    }

    const response = toArticle(article);

    // Cache the response
    if (redis) {
      await redis.set(cacheKey, response, { ex: CACHE_TTL.ARTICLE });
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("Failed to fetch article:", error);
    return NextResponse.json(
      { error: "Failed to fetch article" },
      { status: 500 }
    );
  }
}
