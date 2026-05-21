"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Clock,
  ExternalLink,
  Globe,
  Tag,
} from "lucide-react";
import { cn, formatDate, scoreColor, scoreBg } from "@/lib/utils";
import { CATEGORIES, type Article } from "@/types";
import { NewsletterSignup } from "@/components/shared/NewsletterSignup";

async function fetchArticle(id: string): Promise<Article> {
  const res = await fetch(`/api/articles/${id}`);
  if (!res.ok) throw new Error("Article not found");
  return res.json();
}

export default function ArticlePage() {
  const params = useParams();
  const id = params.id as string;

  const {
    data: article,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["article", id],
    queryFn: () => fetchArticle(id),
  });

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="skeleton h-4 w-24 mb-6" />
        <div className="skeleton h-8 w-full mb-3" />
        <div className="skeleton h-8 w-3/4 mb-6" />
        <div className="skeleton h-4 w-full mb-2" />
        <div className="skeleton h-4 w-full mb-2" />
        <div className="skeleton h-4 w-2/3 mb-6" />
        <div className="flex gap-2 mb-6">
          <div className="skeleton h-6 w-20" />
          <div className="skeleton h-6 w-20" />
          <div className="skeleton h-6 w-20" />
        </div>
        <div className="skeleton h-40 w-full" />
      </div>
    );
  }

  if (isError || !article) {
    return (
      <div className="max-w-3xl mx-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-mono text-muted hover:text-accent-cyan transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to feed
        </Link>
        <div className="border border-accent-red/30 rounded-lg bg-accent-red/5 p-8 text-center">
          <p className="text-sm font-mono text-accent-red mb-2">
            Article not found
          </p>
          <p className="text-xs text-muted">
            {(error as Error)?.message || "This article may have been removed."}
          </p>
        </div>
      </div>
    );
  }

  const category = CATEGORIES.find((c) => c.id === article.category);
  const categoryColor = category?.color ?? "text-muted";

  return (
    <article className="max-w-3xl mx-auto">
      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm font-mono text-muted hover:text-accent-cyan transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to feed
      </Link>

      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <span
            className={cn(
              "category-badge",
              categoryColor,
              categoryColor.replace("text-", "border-") + "/30"
            )}
          >
            {category?.label ?? article.category}
          </span>
          <span className="flex items-center gap-1 text-xs font-mono text-muted">
            <Clock className="w-3 h-3" />
            {formatDate(article.publishedAt)}
          </span>
        </div>

        <h1 className="text-2xl font-bold text-foreground leading-tight mb-4">
          {article.title}
        </h1>

        {/* Source info */}
        <div className="flex items-center gap-4 text-sm font-mono text-muted">
          <span className="flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5" />
            {article.source}
          </span>
          {article.author && (
            <span className="flex items-center gap-1.5">
              <span className="text-muted/60">by</span> {article.author}
            </span>
          )}
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-accent-cyan hover:text-accent-green transition-colors ml-auto"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Source
          </a>
        </div>
      </header>

      {/* TL;DR */}
      {article.tlDr && (
        <div className="border-l-2 border-accent-cyan pl-4 mb-8 py-2 bg-accent-cyan/5 rounded-r-lg">
          <p className="text-xs font-mono text-accent-cyan font-semibold uppercase tracking-wider mb-1">
            TL;DR
          </p>
          <p className="text-sm text-foreground/90 leading-relaxed">
            {article.tlDr}
          </p>
        </div>
      )}

      {/* Scores */}
      <section className="mb-8">
        <h2 className="text-xs font-mono font-semibold text-muted uppercase tracking-wider mb-3">
          ANN Intelligence Scores
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <ScoreCard label="Signal" score={article.scores.signalScore} description="Overall signal strength" />
          <ScoreCard label="Builder" score={article.scores.builderScore} description="Developer relevance" />
          <ScoreCard label="Enterprise" score={article.scores.enterpriseScore} description="Enterprise impact" />
          <ScoreCard label="Open Source" score={article.scores.openSourceScore} description="OSS community value" />
          <ScoreCard label="Security" score={article.scores.securityScore} description="Security implications" />
          <ScoreCard label="Hype" score={article.scores.hypeScore} description="Hype-to-signal ratio" inverted />
        </div>
      </section>

      {/* Article body — full journalistic piece, paragraphs split on \n\n */}
      <section className="mb-8">
        <ArticleBody content={article.content} fallbackSummary={article.summary} />
      </section>

      {/* Tags */}
      {article.tags.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-mono font-semibold text-muted uppercase tracking-wider mb-3">
            Tags
          </h2>
          <div className="flex flex-wrap gap-2">
            {article.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs font-mono text-muted bg-muted/5 border border-border px-2.5 py-1 rounded"
              >
                #{tag}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Newsletter */}
      <div className="mb-8">
        <NewsletterSignup />
      </div>

      {/* Related Articles */}
      {article.relatedArticles && article.relatedArticles.length > 0 && (
        <section>
          <h2 className="text-xs font-mono font-semibold text-muted uppercase tracking-wider mb-3">
            Related Signals
          </h2>
          <div className="space-y-2">
            {article.relatedArticles.map((relatedId) => (
              <RelatedArticle key={relatedId} id={relatedId} />
            ))}
          </div>
        </section>
      )}
    </article>
  );
}

function ArticleBody({
  content,
  fallbackSummary,
}: {
  content?: string;
  fallbackSummary: string;
}) {
  // Body is plain prose from ArticleWriter — split on blank lines into paragraphs.
  const body = (content && content.trim()) || fallbackSummary;
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div className="space-y-4 text-[15px] leading-7 text-foreground/90">
      {paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}

function ScoreCard({
  label,
  score,
  description,
  inverted,
}: {
  label: string;
  score: number;
  description: string;
  inverted?: boolean;
}) {
  const displayScore = inverted ? 100 - score : score;
  return (
    <div
      className={cn(
        "border rounded-lg p-3",
        scoreBg(displayScore)
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-mono font-semibold text-muted">
          {label}
        </span>
        <span className={cn("text-sm font-mono font-bold", scoreColor(displayScore))}>
          {displayScore}
        </span>
      </div>
      <div className="w-full h-1.5 bg-black/30 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            displayScore >= 80
              ? "bg-emerald-400"
              : displayScore >= 60
                ? "bg-cyan-400"
                : displayScore >= 40
                  ? "bg-yellow-400"
                  : displayScore >= 20
                    ? "bg-orange-400"
                    : "bg-red-400"
          )}
          style={{ width: `${displayScore}%` }}
        />
      </div>
      <p className="text-[10px] text-muted/60 mt-1 font-mono">{description}</p>
    </div>
  );
}

function RelatedArticle({ id }: { id: string }) {
  const { data: article } = useQuery({
    queryKey: ["article", id],
    queryFn: () => fetchArticle(id),
  });

  if (!article) return null;

  return (
    <Link
      href={`/articles/${article.id}`}
      className="flex items-center justify-between p-3 border border-border rounded-lg bg-terminal-card hover:bg-terminal-hover transition-colors"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {article.title}
        </p>
        <p className="text-xs font-mono text-muted mt-0.5">
          {article.source} · {formatDate(article.publishedAt)}
        </p>
      </div>
      <ArrowUpRight className="w-4 h-4 text-muted shrink-0 ml-3" />
    </Link>
  );
}
