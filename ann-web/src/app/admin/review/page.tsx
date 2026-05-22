"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Shield,
  Scale,
  Flag,
  Brain,
  Clock,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

interface ReviewArticle {
  id: string;
  title: string;
  slug: string;
  url: string;
  source: string;
  sourceUrl: string | null;
  author: string | null;
  publishedAt: string;
  summary: string;
  tlDr: string | null;
  content: string | null;
  tags: string[];
  category: string;
  section: string | null;
  region: string | null;
  country: string | null;
  storyStatus: string;
  sourcesAnalyzed: number;
  riskLevel: string;
  requiresHumanReview: boolean;
  overallConfidence: number | null;
  hallucinationRisk: number | null;
  riskFactors: string[];
  legalConcerns: string[];
  biasConcerns: string[];
  safetyFlags: string[];
  scores: {
    signalScore: number;
    hypeScore: number;
    builderScore: number;
    securityScore: number;
    openSourceScore: number;
    enterpriseScore: number;
    overallScore: number;
  } | null;
  agentActions: Array<{
    agentRole: string;
    state: string;
    durationMs: number | null;
    error: string | null;
    completedAt: string | null;
  }>;
  createdAt: string;
}

interface ReviewResponse {
  articles: ReviewArticle[];
  total: number;
}

async function fetchReviewQueue(): Promise<ReviewResponse> {
  const res = await fetch("/api/admin/review");
  if (!res.ok) throw new Error("Failed to fetch review queue");
  return res.json();
}

async function submitReview({
  articleId,
  action,
  reviewer,
  notes,
}: {
  articleId: string;
  action: "approve" | "reject";
  reviewer?: string;
  notes?: string;
}) {
  const res = await fetch("/api/admin/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ articleId, action, reviewer, notes }),
  });
  if (!res.ok) throw new Error("Failed to submit review");
  return res.json();
}

export default function ReviewQueuePage() {
  const queryClient = useQueryClient();
  const [selectedArticle, setSelectedArticle] = useState<ReviewArticle | null>(
    null
  );
  const [rejectNotes, setRejectNotes] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-review"],
    queryFn: fetchReviewQueue,
    refetchInterval: 15_000,
  });

  const reviewMutation = useMutation({
    mutationFn: submitReview,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-review"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      setSelectedArticle(null);
      setRejectNotes("");
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-6 w-48 mb-6" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton h-32 rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="border border-accent-red/30 rounded-lg bg-accent-red/5 p-8 text-center">
        <p className="text-sm font-mono text-accent-red mb-2">
          Error loading review queue
        </p>
        <p className="text-xs text-muted">
          {(error as Error)?.message || "An unexpected error occurred."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-mono font-bold text-foreground mb-1">
            Review Queue
          </h1>
          <p className="text-xs font-mono text-muted">
            {data.total} article{data.total !== 1 ? "s" : ""} pending human
            review
          </p>
        </div>
        {data.total > 0 && (
          <span className="flex items-center gap-1.5 text-xs font-mono text-accent-yellow border border-accent-yellow/30 rounded-md px-2.5 py-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Attention Required
          </span>
        )}
      </div>

      {data.articles.length === 0 ? (
        <div className="border border-border rounded-lg bg-terminal-card p-12 text-center">
          <CheckCircle2 className="w-8 h-8 text-accent-green mx-auto mb-3" />
          <p className="text-sm font-mono text-foreground mb-1">
            All Clear
          </p>
          <p className="text-xs text-muted">
            No articles currently need human review.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.articles.map((article) => (
            <div
              key={article.id}
              className={cn(
                "border rounded-lg bg-terminal-card overflow-hidden transition-all",
                article.riskLevel === "high"
                  ? "border-accent-red/30"
                  : article.riskLevel === "medium"
                    ? "border-accent-yellow/30"
                    : "border-border",
                selectedArticle?.id === article.id && "ring-1 ring-accent-cyan"
              )}
            >
              {/* Article Header */}
              <div
                className="p-4 cursor-pointer hover:bg-terminal-hover transition-colors"
                onClick={() =>
                  setSelectedArticle(
                    selectedArticle?.id === article.id ? null : article
                  )
                }
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={cn(
                          "text-xs font-mono px-2 py-0.5 rounded-full border",
                          article.riskLevel === "high"
                            ? "text-accent-red border-accent-red/30 bg-accent-red/5"
                            : article.riskLevel === "medium"
                              ? "text-accent-yellow border-accent-yellow/30 bg-accent-yellow/5"
                              : "text-accent-green border-accent-green/30 bg-accent-green/5"
                        )}
                      >
                        {article.riskLevel} risk
                      </span>
                      <span className="text-xs font-mono text-muted capitalize">
                        {article.category.replace(/-/g, " ")}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-foreground leading-relaxed">
                      {article.title}
                    </h3>
                    <p className="text-xs text-muted mt-1 line-clamp-2 font-mono">
                      {article.summary}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-mono text-muted">
                      {article.section && (
                        <span className="border border-border rounded px-1.5 py-0.5 uppercase">
                          {article.section}
                        </span>
                      )}
                      {article.region && (
                        <span className="border border-border rounded px-1.5 py-0.5 uppercase">
                          {article.region}
                        </span>
                      )}
                      {article.country && article.country !== "global" && (
                        <span className="border border-border rounded px-1.5 py-0.5 uppercase">
                          {article.country}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(article.publishedAt)}
                      </span>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        reviewMutation.mutate({
                          articleId: article.id,
                          action: "approve",
                        });
                      }}
                      disabled={reviewMutation.isPending}
                      className="p-2 rounded-md text-accent-green hover:bg-accent-green/10 transition-colors disabled:opacity-50"
                      title="Approve"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedArticle(article);
                      }}
                      className="p-2 rounded-md text-accent-red hover:bg-accent-red/10 transition-colors"
                      title="Reject"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Risk Factors */}
                {article.riskFactors.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {article.riskFactors.map((factor) => (
                      <span
                        key={factor}
                        className="text-[10px] font-mono text-accent-red/80 bg-accent-red/5 border border-accent-red/20 px-2 py-0.5 rounded"
                      >
                        {factor}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Expanded Details */}
              {selectedArticle?.id === article.id && (
                <div className="border-t border-border px-4 py-4 space-y-4">
                  {/* Confidence & Risk Scores */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <DetailBox
                      label="Confidence"
                      value={
                        article.overallConfidence != null
                          ? `${(article.overallConfidence * 100).toFixed(0)}%`
                          : "N/A"
                      }
                      color={
                        article.overallConfidence != null &&
                        article.overallConfidence >= 0.8
                          ? "text-accent-green"
                          : article.overallConfidence != null &&
                              article.overallConfidence >= 0.5
                            ? "text-accent-yellow"
                            : "text-accent-red"
                      }
                      icon={Brain}
                    />
                    <DetailBox
                      label="Hallucination Risk"
                      value={
                        article.hallucinationRisk != null
                          ? `${(article.hallucinationRisk * 100).toFixed(0)}%`
                          : "N/A"
                      }
                      color={
                        article.hallucinationRisk != null &&
                        article.hallucinationRisk < 0.3
                          ? "text-accent-green"
                          : article.hallucinationRisk != null &&
                              article.hallucinationRisk < 0.6
                            ? "text-accent-yellow"
                            : "text-accent-red"
                      }
                      icon={AlertTriangle}
                    />
                    <DetailBox
                      label="Legal Concerns"
                      value={article.legalConcerns.length.toString()}
                      color={
                        article.legalConcerns.length > 0
                          ? "text-accent-red"
                          : "text-accent-green"
                      }
                      icon={Scale}
                    />
                    <DetailBox
                      label="Bias Flags"
                      value={article.biasConcerns.length.toString()}
                      color={
                        article.biasConcerns.length > 0
                          ? "text-accent-yellow"
                          : "text-accent-green"
                      }
                      icon={Flag}
                    />
                  </div>

                  {/* Safety Flags */}
                  {article.safetyFlags.length > 0 && (
                    <div>
                      <p className="text-xs font-mono text-muted mb-2">
                        Safety Flags
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {article.safetyFlags.map((flag) => (
                          <span
                            key={flag}
                            className="text-xs font-mono text-accent-red bg-accent-red/5 border border-accent-red/20 px-2 py-1 rounded"
                          >
                            <Shield className="w-3 h-3 inline mr-1" />
                            {flag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Draft body and source pack */}
                  <div className="space-y-3">
                    <p className="text-xs font-mono text-muted">Draft article</p>
                    <div className="border border-border rounded-md bg-terminal-bg/60 p-3 space-y-3">
                      {article.tlDr && (
                        <div className="text-xs font-mono text-accent-cyan border-l border-accent-cyan/40 pl-2">
                          <span className="text-accent-cyan/70">TL;DR </span>
                          {article.tlDr}
                        </div>
                      )}
                      <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                        {splitArticleBody(article.content || article.summary).length > 0 ? (
                          splitArticleBody(article.content || article.summary).map((paragraph, idx) => (
                            <p key={idx}>{paragraph}</p>
                          ))
                        ) : (
                          <p className="text-xs text-muted">No draft body generated.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-mono text-muted">Sources</p>
                    <div className="border border-border rounded-md bg-terminal-bg/60 p-3 space-y-2 text-xs font-mono text-muted">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-foreground">{article.source}</span>
                        {article.author && <span>by {article.author}</span>}
                        <span className="text-muted/70">
                          {article.sourcesAnalyzed} source
                          {article.sourcesAnalyzed === 1 ? "" : "s"} analyzed
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-4">
                        <a
                          href={article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-accent-cyan hover:text-accent-green"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Canonical story URL
                        </a>
                        {article.sourceUrl && (
                          <a
                            href={article.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-accent-cyan hover:text-accent-green"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Original source link
                          </a>
                        )}
                      </div>
                      {article.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {article.tags.slice(0, 10).map((tag) => (
                            <span
                              key={tag}
                              className="text-[10px] text-muted border border-border rounded px-1.5 py-0.5"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Agent Actions */}
                  {article.agentActions.length > 0 && (
                    <div>
                      <p className="text-xs font-mono text-muted mb-2">
                        Agent Actions
                      </p>
                      <div className="space-y-1">
                        {article.agentActions.map((action, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-3 text-xs font-mono text-muted"
                          >
                            <span
                              className={cn(
                                "w-1.5 h-1.5 rounded-full shrink-0",
                                action.state === "completed"
                                  ? "bg-accent-green"
                                  : action.state === "error"
                                    ? "bg-accent-red"
                                    : "bg-accent-yellow"
                              )}
                            />
                            <span className="capitalize">
                              {action.agentRole.replace(/_/g, " ")}
                            </span>
                            {action.durationMs && (
                              <span className="text-muted/60">
                                {action.durationMs}ms
                              </span>
                            )}
                            {action.error && (
                              <span className="text-accent-red">
                                {action.error}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Reject Form */}
                  <div className="flex items-center gap-3 pt-2 border-t border-border">
                    <input
                      type="text"
                      placeholder="Rejection notes (optional)..."
                      value={rejectNotes}
                      onChange={(e) => setRejectNotes(e.target.value)}
                      className="flex-1 terminal-input text-xs"
                    />
                    <button
                      onClick={() =>
                        reviewMutation.mutate({
                          articleId: article.id,
                          action: "approve",
                        })
                      }
                      disabled={reviewMutation.isPending}
                      className="px-3 py-1.5 text-xs font-mono text-accent-green border border-accent-green/30 rounded-md hover:bg-accent-green/10 transition-colors disabled:opacity-50"
                    >
                      {reviewMutation.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        "Approve"
                      )}
                    </button>
                    <button
                      onClick={() =>
                        reviewMutation.mutate({
                          articleId: article.id,
                          action: "reject",
                          notes: rejectNotes,
                        })
                      }
                      disabled={reviewMutation.isPending}
                      className="px-3 py-1.5 text-xs font-mono text-accent-red border border-accent-red/30 rounded-md hover:bg-accent-red/10 transition-colors disabled:opacity-50"
                    >
                      {reviewMutation.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        "Reject"
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function splitArticleBody(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function DetailBox({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string;
  value: string;
  color: string;
  icon: React.ElementType;
}) {
  return (
    <div className="border border-border rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={cn("w-3.5 h-3.5", color)} />
        <span className="text-[10px] font-mono text-muted">{label}</span>
      </div>
      <p className={cn("text-sm font-mono font-bold", color)}>{value}</p>
    </div>
  );
}
