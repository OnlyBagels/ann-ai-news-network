"use client";

import Link from "next/link";
import { ArrowUpRight, Clock, Tag } from "lucide-react";
import { cn, formatDate, scoreColor, scoreBg } from "@/lib/utils";
import type { Article } from "@/types";
import { CATEGORIES } from "@/types";

interface FeedCardProps {
  article: Article;
}

export function FeedCard({ article }: FeedCardProps) {
  const category = CATEGORIES.find((c) => c.id === article.category);
  const categoryColor = category?.color ?? "text-muted";

  return (
    <article className="group border border-border rounded-sm bg-terminal-card hover:bg-terminal-hover transition-all duration-200 hover:border-accent-cyan/20">
      <Link href={`/articles/${article.id}`} className="block p-4">
        {/* Header: Category + Timestamp */}
        <div className="flex items-center gap-3 mb-2">
          <span
            className={cn(
              "category-badge",
              categoryColor,
              categoryColor.replace("text-", "border-") + "/30"
            )}
          >
            {category?.label ?? article.category}
          </span>
          <span className="flex items-center gap-1 text-[11px] font-mono text-muted">
            <Clock className="w-3 h-3" />
            {formatDate(article.publishedAt)}
          </span>
          <span className="text-[11px] font-mono text-muted/50">
            {article.source}
          </span>
        </div>

        {/* Title */}
        <h2 className="text-sm font-semibold text-foreground group-hover:text-accent-cyan transition-colors mb-1.5 leading-relaxed">
          {article.title}
        </h2>

        {/* Summary / TL;DR */}
        {article.tlDr && (
          <p className="text-xs text-muted mb-2 font-mono leading-relaxed border-l border-accent-cyan/15 pl-2.5">
            <span className="text-accent-cyan/50 text-[10px] font-semibold uppercase tracking-wider">
              TL;DR{" "}
            </span>
            {article.tlDr}
          </p>
        )}

        {/* Scores Row */}
        <div className="flex flex-wrap gap-1 mb-2">
          <ScoreBadge label="Signal" score={article.scores.signalScore} />
          <ScoreBadge label="Builder" score={article.scores.builderScore} />
          <ScoreBadge label="Enterprise" score={article.scores.enterpriseScore} />
          <ScoreBadge label="Open Source" score={article.scores.openSourceScore} />
          <ScoreBadge label="Security" score={article.scores.securityScore} />
          <ScoreBadge label="Hype" score={article.scores.hypeScore} />
        </div>

        {/* Tags + Link */}
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-1">
            {article.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="text-[10px] font-mono text-muted/50 bg-muted/5 px-1.5 py-0.5 rounded"
              >
                #{tag}
              </span>
            ))}
          </div>
          <ArrowUpRight className="w-3 h-3 text-muted/40 group-hover:text-accent-cyan transition-colors shrink-0" />
        </div>
      </Link>
    </article>
  );
}

function ScoreBadge({
  label,
  score,
}: {
  label: string;
  score: number;
}) {
  return (
    <span className={cn("score-badge", scoreColor(score), scoreBg(score))}>
      <span className="opacity-60">{label}</span>
      <span>{score}</span>
    </span>
  );
}
