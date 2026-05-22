import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { redis, getCacheKey, CACHE_TTL } from "@/lib/redis";

const VALID_CATEGORIES = new Set([
  "models",
  "open_source",
  "coding_ai",
  "agents",
  "research",
  "security",
  "funding",
  "regulation",
]);

const GEO_REGION_MAP: Record<string, { regions?: string[]; countries?: string[] }> = {
  "north-america": {
    regions: ["us"],
    countries: ["us", "ca", "mx"],
  },
  america: {
    regions: ["us"],
    countries: ["us"],
  },
  americas: {
    regions: ["us", "latam"],
    countries: [
      "us",
      "ca",
      "mx",
      "gt",
      "hn",
      "sv",
      "ni",
      "cr",
      "pa",
      "bz",
      "cu",
      "do",
      "ht",
      "jm",
      "tt",
      "br",
      "ar",
      "cl",
      "co",
      "pe",
      "uy",
      "py",
      "bo",
      "ec",
      "ve",
      "gy",
      "sr",
    ],
  },
  europe: {
    regions: ["eu", "uk", "ru", "ua"],
    countries: ["gb", "ie", "fr", "de", "es", "it", "nl", "be", "pt", "pl", "ru", "ua"],
  },
  asia: {
    regions: ["asia", "cn", "jp"],
    countries: ["cn", "jp", "kr", "in", "pk", "bd", "th", "vn", "id", "ph", "my", "sg", "tw"],
  },
  africa: {
    regions: ["africa"],
    countries: ["za", "ng", "ke", "et", "gh", "eg", "ma", "tn", "dz", "sn", "tz", "ug"],
  },
  "middle-east": {
    regions: ["me"],
    countries: ["sa", "ae", "qa", "kw", "om", "bh", "jo", "lb", "il", "ir", "iq", "ye", "sy"],
  },
  oceania: {
    regions: ["oceania"],
    countries: ["au", "nz"],
  },
};

function normalizeCountry(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function geoFilterWhere(geo: string | null): Prisma.ArticleWhereInput | null {
  if (!geo) return null;
  const config = GEO_REGION_MAP[geo.toLowerCase()];
  if (!config) return null;

  const orFilters: Prisma.ArticleWhereInput[] = [];
  if (config.regions && config.regions.length > 0) {
    orFilters.push({ region: { in: config.regions } });
  }
  if (config.countries && config.countries.length > 0) {
    orFilters.push({ country: { in: config.countries } });
  }
  return orFilters.length > 0 ? { OR: orFilters } : null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20")));
  const category = searchParams.get("category");
  const section = searchParams.get("section");
  const region = searchParams.get("region");
  const country = normalizeCountry(searchParams.get("country"));
  const geo = searchParams.get("geo");
  const sort = searchParams.get("sort") || "signal";
  const search = searchParams.get("search");

  const cacheKey = getCacheKey(
    "feed",
    page.toString(),
    limit.toString(),
    category || undefined,
    section || undefined,
    region || undefined,
    country || undefined,
    geo || undefined,
    sort,
    search || undefined,
  );

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
    const where: Prisma.ArticleWhereInput = {
      storyStatus: { in: ["approved", "published"] },
    };
    const andFilters: Prisma.ArticleWhereInput[] = [];

    if (category && VALID_CATEGORIES.has(category)) {
      andFilters.push({ category: category as never });
    }
    if (section) {
      andFilters.push({ section });
    }
    if (region) {
      andFilters.push({ region });
    }
    if (country) {
      andFilters.push({ country });
    }
    const geoWhere = geoFilterWhere(geo);
    if (geoWhere) {
      andFilters.push(geoWhere);
    }
    if (search) {
      andFilters.push({
        OR: [
        { title: { contains: search, mode: "insensitive" } },
        { summary: { contains: search, mode: "insensitive" } },
        { tags: { has: search } },
        ],
      });
    }
    if (andFilters.length > 0) {
      where.AND = andFilters;
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
        section: article.section,
        region: article.region,
        country: article.country,
        subCategory: article.subCategory,
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
