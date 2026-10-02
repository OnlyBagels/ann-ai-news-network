import type { Prisma, Category as DbCategory, StoryStatus } from "@prisma/client";
import type { Article, Category } from "@/types";

// Only stories that passed the pipeline (or a human editor) are public.
export const PUBLIC_STATUSES: StoryStatus[] = ["approved", "published"];

// The database enum uses underscores (open_source); URLs and the UI use
// hyphens (open-source).
export function toDbCategory(slug: string): DbCategory | null {
  const value = slug.replace(/-/g, "_");
  const valid: string[] = ["models", "open_source", "coding_ai", "agents", "research", "security", "funding", "regulation"];
  return valid.includes(value) ? (value as DbCategory) : null;
}

export function toUiCategory(category: DbCategory | string): Category {
  return category.replace(/_/g, "-") as Category;
}

const EMPTY_SCORES = {
  signalScore: 0,
  hypeScore: 0,
  builderScore: 0,
  securityScore: 0,
  openSourceScore: 0,
  enterpriseScore: 0,
  overallScore: 0,
};

type ArticleWithScores = Prisma.ArticleGetPayload<{ include: { scores: true } }>;

export function toArticle(row: ArticleWithScores): Article {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    url: row.url,
    source: row.source,
    sourceUrl: row.sourceUrl ?? undefined,
    author: row.author ?? undefined,
    publishedAt: row.publishedAt.toISOString(),
    summary: row.summary,
    tlDr: row.tlDr ?? undefined,
    content: row.content ?? undefined,
    tags: row.tags,
    category: toUiCategory(row.category),
    scores: row.scores
      ? {
          signalScore: row.scores.signalScore,
          hypeScore: row.scores.hypeScore,
          builderScore: row.scores.builderScore,
          securityScore: row.scores.securityScore,
          openSourceScore: row.scores.openSourceScore,
          enterpriseScore: row.scores.enterpriseScore,
          overallScore: row.scores.overallScore,
        }
      : EMPTY_SCORES,
    imageUrl: row.imageUrl ?? undefined,
    relatedArticles: row.relatedArticles,
  };
}
