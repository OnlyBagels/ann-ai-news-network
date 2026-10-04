"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, Clock, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AgentAction {
  agentRole: string;
  state: string;
  durationMs: number | null;
  error: string | null;
  createdAt: string;
}

interface AdminStats {
  recentActions: AgentAction[];
}

async function fetchAgentLogs(): Promise<AdminStats> {
  const res = await fetch("/api/admin/stats");
  if (!res.ok) throw new Error("Failed to fetch agent logs");
  return res.json();
}

const agentRoles = [
  { role: "model_reporter", label: "Model Reporter", color: "text-foreground" },
  { role: "open_source_reporter", label: "Open Source Reporter", color: "text-foreground" },
  { role: "research_reporter", label: "Research Reporter", color: "text-foreground" },
  { role: "security_reporter", label: "Security Reporter", color: "text-foreground" },
  { role: "regulation_reporter", label: "Regulation Reporter", color: "text-foreground" },
  { role: "business_reporter", label: "Business Reporter", color: "text-foreground" },
  { role: "research_agent", label: "Research Agent", color: "text-foreground" },
  { role: "fact_check_agent", label: "Fact Check Agent", color: "text-foreground" },
  { role: "headline_editor", label: "Headline Editor", color: "text-foreground" },
  { role: "technical_editor", label: "Technical Editor", color: "text-foreground" },
  { role: "style_editor", label: "Style Editor", color: "text-foreground" },
  { role: "summary_editor", label: "Summary Editor", color: "text-foreground" },
  { role: "risk_agent", label: "Risk Agent", color: "text-foreground" },
  { role: "legal_agent", label: "Legal Agent", color: "text-foreground" },
  { role: "bias_agent", label: "Bias Agent", color: "text-foreground" },
  { role: "editor_in_chief", label: "Editor-in-Chief", color: "text-foreground" },
];

export default function AgentLogsPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: fetchAgentLogs,
    refetchInterval: 10_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-6 w-48 mb-6" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton h-12 rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="border border-brand/30 rounded-lg bg-brand/5 p-8 text-center">
        <p className="text-sm font-mono text-brand mb-2">
          Error loading agent logs
        </p>
        <p className="text-xs text-muted-foreground">
          {(error as Error)?.message || "An unexpected error occurred."}
        </p>
      </div>
    );
  }

  // Group actions by agent role
  const groupedActions = new Map<string, AgentAction[]>();
  for (const action of data.recentActions) {
    const existing = groupedActions.get(action.agentRole) || [];
    existing.push(action);
    groupedActions.set(action.agentRole, existing);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-lg font-mono font-bold text-foreground mb-1">
          Agent Logs
        </h1>
        <p className="text-xs font-mono text-muted-foreground">
          Recent activity from the agentic newsroom pipeline
        </p>
      </div>

      {/* Agent Status Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {agentRoles.map((agent) => {
          const actions = groupedActions.get(agent.role) || [];
          const latestAction = actions[0];
          const totalActions = actions.length;
          const errorCount = actions.filter((a) => a.state === "error").length;

          return (
            <div
              key={agent.role}
              className="border border-border rounded-lg bg-panel p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className={cn("text-xs font-mono font-semibold", agent.color)}>
                  {agent.label}
                </span>
                <span
                  className={cn(
                    "w-2 h-2 rounded-full",
                    errorCount > 0
                      ? "bg-brand"
                      : latestAction?.state === "completed"
                        ? "bg-border-strong"
                        : "bg-warn"
                  )}
                />
              </div>
              <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Activity className="w-3 h-3" />
                  {totalActions}
                </span>
                {errorCount > 0 && (
                  <span className="flex items-center gap-1 text-brand">
                    <AlertCircle className="w-3 h-3" />
                    {errorCount}
                  </span>
                )}
                {latestAction?.durationMs && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {latestAction.durationMs}ms
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Activity Feed */}
      <section>
        <h2 className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Recent Activity
        </h2>
        <div className="border border-border rounded-lg bg-panel overflow-hidden">
          {data.recentActions.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm font-mono text-muted-foreground">No agent activity yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {data.recentActions.map((action, i) => {
                const agentInfo = agentRoles.find(
                  (a) => a.role === action.agentRole
                );
                return (
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
                      <span
                        className={cn(
                          "text-sm font-mono",
                          agentInfo?.color || "text-foreground"
                        )}
                      >
                        {agentInfo?.label || action.agentRole}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
                      {action.state === "completed" && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-foreground" />
                      )}
                      {action.state === "error" && (
                        <span className="text-brand" title={action.error || ""}>
                          {action.error?.slice(0, 40)}...
                        </span>
                      )}
                      {action.durationMs && (
                        <span>{action.durationMs}ms</span>
                      )}
                      <span className="text-muted-foreground/60">
                        {formatTimeAgo(action.createdAt)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
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
