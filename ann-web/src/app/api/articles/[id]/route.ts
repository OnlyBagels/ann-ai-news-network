import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis, getCacheKey, CACHE_TTL } from "@/lib/redis";

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
    // Public detail: only serve articles that have cleared review.
    // Drafts and rejects 404 here so they can't be deep-linked.
    const article = await prisma.article.findFirst({
      where: {
        id,
        storyStatus: { in: ["approved", "published"] },
      },
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

    const response = {
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
      content: article.content,
      tags: article.tags,
      category: article.category,
      scores: article.scores,
      imageUrl: article.imageUrl,
      relatedArticles: article.relatedArticles,
    };

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
