"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Radio,
  XCircle,
  TrendingUp,
  Shield,
  Code2,
  Building2,
  Sparkles,
  AlertOctagon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AdminStats {
  articles: {
    total: number;
    published: number;
    pendingReview: number;
    rejected: number;
  };
  sources: {
    active: number;
  };
  scores: {
    avgSignal: number;
    avgHype: number;
    avgBuilder: number;
    avgSecurity: number;
    avgOpenSource: number;
    avgEnterprise: number;
    avgOverall: number;
  };
  categories: Array<{
    category: string;
    count: number;
  }>;
  recentActions: Array<{
    agentRole: string;
    state: string;
    durationMs: number | null;
    error: string | null;
    createdAt: string;
  }>;
}

async function fetchStats(): Promise<AdminStats> {
  const res = await fetch("/api/admin/stats");
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

export default function AdminDashboard() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: fetchStats,
    refetchInterval: 30_000, // Refresh every 30s
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-8">
        <div className="skeleton h-6 w-48 mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-24 rounded-lg" />
          ))}
        </div>
        <div className="skeleton h-64 rounded-lg" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="border border-brand/30 rounded-lg bg-brand/5 p-8 text-center">
        <p className="text-sm font-mono text-brand mb-2">
          Error loading dashboard
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
      <h2 className="text-2xl font-semibold">What the newsroom is doing</h2>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={FileText}
          label="Stories in total"
          value={data.articles.total}
          color="text-foreground"
        />
        <StatCard
          icon={CheckCircle2}
          label="Published"
          value={data.articles.published}
          color="text-foreground"
        />
        <StatCard
          icon={AlertTriangle}
          label="Waiting for review"
          value={data.articles.pendingReview}
          color="text-warn"
        />
        <StatCard
          icon={XCircle}
          label="Rejected"
          value={data.articles.rejected}
          color="text-foreground"
        />
      </div>

      {/* Average Scores */}
      <section>
        <h2 className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Average Scores
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <ScoreStat label="Signal" score={data.scores.avgSignal} icon={TrendingUp} />
          <ScoreStat label="Builder" score={data.scores.avgBuilder} icon={Code2} />
          <ScoreStat label="Enterprise" score={data.scores.avgEnterprise} icon={Building2} />
          <ScoreStat label="Open Source" score={data.scores.avgOpenSource} icon={Sparkles} />
          <ScoreStat label="Security" score={data.scores.avgSecurity} icon={Shield} />
          <ScoreStat label="Hype" score={data.scores.avgHype} icon={AlertOctagon} inverted />
          <ScoreStat label="Overall" score={data.scores.avgOverall} icon={Activity} />
        </div>
      </section>

      {/* Category Breakdown */}
      <section>
        <h2 className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Published by Category
        </h2>
        <div className="border border-border rounded-lg bg-panel overflow-hidden">
          {data.categories.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm font-mono text-muted-foreground">No published articles yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {data.categories.map((cat) => (
                <div
                  key={cat.category}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <span className="text-sm font-mono text-foreground capitalize">
                    {cat.category.replace(/-/g, " ")}
                  </span>
                  <span className="text-sm font-mono font-semibold">
                    {cat.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Recent Agent Actions */}
      <section>
        <h2 className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Recent Agent Activity
        </h2>
        <div className="border border-border rounded-lg bg-panel overflow-hidden">
          {data.recentActions.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm font-mono text-muted-foreground">No agent activity yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {data.recentActions.map((action, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        action.state === "completed"
                          ? "bg-border-strong"
                          : action.state === "error"
                            ? "bg-brand"
                            : "bg-warn"
                      )}
                    />
                    <span className="text-sm font-mono text-foreground">
                      {action.agentRole}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
                    {action.durationMs && (
                      <span>{action.durationMs}ms</span>
                    )}
                    {action.error && (
                      <span className="text-brand" title={action.error}>
                        error
                      </span>
                    )}
                    <span className="text-muted-foreground/60">
                      {formatTimeAgo(action.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="border border-border rounded-lg bg-panel p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-mono text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
      </div>
      <p className={cn("text-2xl font-semibold", color)}>{value}</p>
    </div>
  );
}

function ScoreStat({
  label,
  score,
  icon: Icon,
  inverted,
}: {
  label: string;
  score: number;
  icon: React.ElementType;
  inverted?: boolean;
}) {
  const displayScore = inverted ? 100 - score : score;
  const colorClass =
    displayScore >= 60 ? "text-foreground" : displayScore >= 40 ? "text-muted-foreground" : "text-warn";

  return (
    <div className="border border-border rounded-lg bg-panel p-3 text-center">
      <Icon className="mx-auto mb-1 h-4 w-4 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
      <p className={cn("text-lg font-semibold", colorClass)}>
        {displayScore}
      </p>
      <p className="text-xs font-mono text-muted-foreground">{label}</p>
    </div>
  );
}

function formatTimeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}
