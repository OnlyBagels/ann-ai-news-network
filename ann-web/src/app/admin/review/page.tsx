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
  summary: string;
  category: string;
  storyStatus: string;
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
      <div className="border border-brand/30 rounded-lg bg-brand/5 p-8 text-center">
        <p className="text-sm font-mono text-brand mb-2">
          Error loading review queue
        </p>
        <p className="text-xs text-muted-foreground">
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
          <p className="text-xs font-mono text-muted-foreground">
            {data.total} article{data.total !== 1 ? "s" : ""} pending human
            review
          </p>
        </div>
        {data.total > 0 && (
          <span className="flex items-center gap-2 text-xs font-mono text-warn border border-warn/30 rounded-md px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5" />
            Attention Required
          </span>
        )}
      </div>

      {data.articles.length === 0 ? (
        <div className="border border-border rounded-lg bg-panel p-12 text-center">
          <CheckCircle2 className="w-8 h-8 text-foreground mx-auto mb-3" />
          <p className="text-sm font-mono text-foreground mb-1">
            All Clear
          </p>
          <p className="text-xs text-muted-foreground">
            No articles currently need human review.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.articles.map((article) => (
            <div
              key={article.id}
              className={cn(
                "border rounded-lg bg-panel overflow-hidden transition-colors",
                article.riskLevel === "high"
                  ? "border-brand/30"
                  : article.riskLevel === "medium"
                    ? "border-warn/30"
                    : "border-border",
                selectedArticle?.id === article.id && "ring-1 ring-brand"
              )}
            >
              {/* Article Header */}
              <div
                className="p-4 cursor-pointer hover:bg-raised transition-colors"
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
                          "text-xs font-mono px-2 py-1 rounded-sm border",
                          article.riskLevel === "high"
                            ? "text-brand border-brand/30 bg-brand/5"
                            : article.riskLevel === "medium"
                              ? "text-warn border-warn/30 bg-warn/5"
                              : "text-foreground border-border-strong/30 bg-border-strong/5"
                        )}
                      >
                        {article.riskLevel} risk
                      </span>
                      <span className="text-xs font-mono text-muted-foreground capitalize">
                        {article.category.replace(/-/g, " ")}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-foreground leading-relaxed">
                      {article.title}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2 font-mono">
                      {article.summary}
                    </p>
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
                      className="p-2 rounded-md text-foreground hover:bg-border-strong/10 transition-colors disabled:opacity-50"
                      title="Approve"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedArticle(article);
                      }}
                      className="p-2 rounded-md text-brand hover:bg-brand/10 transition-colors"
                      title="Reject"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Risk Factors */}
                {article.riskFactors.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {article.riskFactors.map((factor) => (
                      <span
                        key={factor}
                        className="text-xs font-mono text-brand/80 bg-brand/5 border border-brand/20 px-2 py-1 rounded"
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
                          ? "text-foreground"
                          : article.overallConfidence != null &&
                              article.overallConfidence >= 0.5
                            ? "text-warn"
                            : "text-brand"
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
                          ? "text-foreground"
                          : article.hallucinationRisk != null &&
                              article.hallucinationRisk < 0.6
                            ? "text-warn"
                            : "text-brand"
                      }
                      icon={AlertTriangle}
                    />
                    <DetailBox
                      label="Legal Concerns"
                      value={article.legalConcerns.length.toString()}
                      color={
                        article.legalConcerns.length > 0
                          ? "text-brand"
                          : "text-foreground"
                      }
                      icon={Scale}
                    />
                    <DetailBox
                      label="Bias Flags"
                      value={article.biasConcerns.length.toString()}
                      color={
                        article.biasConcerns.length > 0
                          ? "text-warn"
                          : "text-foreground"
                      }
                      icon={Flag}
                    />
                  </div>

                  {/* Safety Flags */}
                  {article.safetyFlags.length > 0 && (
                    <div>
                      <p className="text-xs font-mono text-muted-foreground mb-2">
                        Safety Flags
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {article.safetyFlags.map((flag) => (
                          <span
                            key={flag}
                            className="text-xs font-mono text-brand bg-brand/5 border border-brand/20 px-2 py-1 rounded"
                          >
                            <Shield className="w-3 h-3 inline mr-1" />
                            {flag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Agent Actions */}
                  {article.agentActions.length > 0 && (
                    <div>
                      <p className="text-xs font-mono text-muted-foreground mb-2">
                        Agent Actions
                      </p>
                      <div className="space-y-1">
                        {article.agentActions.map((action, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-3 text-xs font-mono text-muted-foreground"
                          >
                            <span
                              className={cn(
                                "w-1.5 h-1.5 rounded-full shrink-0",
                                action.state === "completed"
                                  ? "bg-border-strong"
                                  : action.state === "error"
                                    ? "bg-brand"
                                    : "bg-warn"
                              )}
                            />
                            <span className="capitalize">
                              {action.agentRole.replace(/_/g, " ")}
                            </span>
                            {action.durationMs && (
                              <span className="text-muted-foreground/60">
                                {action.durationMs}ms
                              </span>
                            )}
                            {action.error && (
                              <span className="text-brand">
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
                      className="px-3 py-2 text-xs font-mono text-foreground border border-border-strong/30 rounded-md hover:bg-border-strong/10 transition-colors disabled:opacity-50"
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
                      className="px-3 py-2 text-xs font-mono text-brand border border-brand/30 rounded-md hover:bg-brand/10 transition-colors disabled:opacity-50"
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
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn("w-3.5 h-3.5", color)} />
        <span className="text-xs font-mono text-muted-foreground">{label}</span>
      </div>
      <p className={cn("text-sm font-mono font-bold", color)}>{value}</p>
    </div>
  );
}
