"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  ExternalLink,
  Lock,
  MessageSquare,
} from "lucide-react";
import { cn, formatDate, scoreColor, scoreBg } from "@/lib/utils";
import { CATEGORIES, type Article } from "@/types";
import { NewsletterSignup } from "@/components/shared/NewsletterSignup";
import { bylineFor, type Persona } from "@/lib/personas";

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
  const byline = bylineFor(article.category);
  const readMinutes = readingTime(article);
  const externalSourceUrl =
    article.sourceUrl || (article.url.startsWith("http") ? article.url : undefined);

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
      <header className="mb-8 border-l-2 border-accent-cyan pl-4">
        {/* Category + read time strip — mirrors the CNN-style header */}
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-3">
          <span className={cn("font-semibold", categoryColor)}>
            {category?.label ?? article.category}
          </span>
          <span>·</span>
          <span>{readMinutes} min read</span>
        </div>

        {/* Headline */}
        <h1 className="text-2xl md:text-3xl font-bold text-foreground leading-tight mb-5">
          {article.title}
        </h1>

        {/* Updated timestamp */}
        <div className="text-xs font-mono uppercase tracking-widest text-muted mb-4">
          Updated <span className="text-foreground/70">{formatDate(article.publishedAt)}</span>
        </div>

        {/* Byline strip — writer + editor + fact-checker with avatars */}
        <div className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm text-foreground/80">
          <span className="text-muted-foreground">By</span>
          <BylineEntry persona={byline.writer} />
          <span className="text-muted-foreground">,</span>
          <BylineEntry persona={byline.editor} prefix="edited by" />
          <span className="text-muted-foreground">,</span>
          <BylineEntry persona={byline.factChecker} prefix="fact-checked by" />
        </div>

        {/* Source link (right-aligned) */}
        <div className="mt-4 flex items-center justify-between gap-3 text-xs font-mono text-muted-foreground">
          <span>Source: {article.source}</span>
          {externalSourceUrl ? (
            <a
              href={externalSourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-accent-cyan hover:text-accent-green transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open original
            </a>
          ) : (
            <span className="text-[11px] text-muted-foreground/70">No external source link</span>
          )}
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

      {/* Comments — sign-in gate placeholder */}
      <CommentsSection />

      {/* AI disclosure footer (per CLAUDE.md) */}
      <p className="text-[11px] font-mono text-muted-foreground/70 italic mb-8 border-t border-border pt-4">
        Drafted by ANN&apos;s agent pipeline; reviewed under the editorial gate
        before publish. See <Link href="/legal/ai-disclosure" className="underline">AI disclosure</Link> for our standards.
      </p>

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

function readingTime(article: Article): number {
  const text = (article.content || article.summary || "") + " " + (article.tlDr || "");
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function BylineEntry({ persona, prefix }: { persona: Persona; prefix?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {prefix && <span className="text-muted-foreground">{prefix}</span>}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={persona.avatarUrl}
        alt=""
        width={20}
        height={20}
        className="w-5 h-5 rounded-full bg-terminal-card border border-border"
      />
      <span
        className="font-semibold text-foreground hover:underline cursor-pointer"
        title={`${persona.role} — ${persona.bio}`}
      >
        {persona.name}
      </span>
    </span>
  );
}

function CommentsSection() {
  return (
    <section className="border border-border rounded-lg bg-terminal-card p-6 mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-mono font-semibold text-muted uppercase tracking-wider flex items-center gap-2">
          <MessageSquare className="w-3.5 h-3.5" />
          Discussion
        </h2>
        <span className="text-[10px] font-mono text-muted-foreground/60">0 comments</span>
      </div>
      <div className="border border-dashed border-border rounded-md p-6 text-center">
        <Lock className="w-4 h-4 text-muted mx-auto mb-2" />
        <p className="text-sm text-foreground/80 mb-1">Comments require an account.</p>
        <p className="text-xs text-muted mb-3">
          Sign in to join the discussion, save articles, and follow beats.
        </p>
        <button
          type="button"
          disabled
          className="text-xs font-mono text-accent-cyan border border-accent-cyan/30 px-4 py-2 rounded-md opacity-60 cursor-not-allowed"
          title="Auth not yet wired"
        >
          Sign in to comment
        </button>
      </div>
    </section>
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
