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
  { role: "model_reporter", label: "Model Reporter", color: "text-cyan-400" },
  { role: "open_source_reporter", label: "Open Source Reporter", color: "text-emerald-400" },
  { role: "research_reporter", label: "Research Reporter", color: "text-pink-400" },
  { role: "security_reporter", label: "Security Reporter", color: "text-red-400" },
  { role: "regulation_reporter", label: "Regulation Reporter", color: "text-orange-400" },
  { role: "business_reporter", label: "Business Reporter", color: "text-yellow-400" },
  { role: "research_agent", label: "Research Agent", color: "text-violet-400" },
  { role: "fact_check_agent", label: "Fact Check Agent", color: "text-blue-400" },
  { role: "headline_editor", label: "Headline Editor", color: "text-cyan-400" },
  { role: "technical_editor", label: "Technical Editor", color: "text-emerald-400" },
  { role: "style_editor", label: "Style Editor", color: "text-blue-400" },
  { role: "summary_editor", label: "Summary Editor", color: "text-violet-400" },
  { role: "risk_agent", label: "Risk Agent", color: "text-red-400" },
  { role: "legal_agent", label: "Legal Agent", color: "text-orange-400" },
  { role: "bias_agent", label: "Bias Agent", color: "text-yellow-400" },
  { role: "editor_in_chief", label: "Editor-in-Chief", color: "text-accent-green" },
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
      <div className="border border-accent-red/30 rounded-lg bg-accent-red/5 p-8 text-center">
        <p className="text-sm font-mono text-accent-red mb-2">
          Error loading agent logs
        </p>
        <p className="text-xs text-muted">
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
        <p className="text-xs font-mono text-muted">
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
              className="border border-border rounded-lg bg-terminal-card p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className={cn("text-xs font-mono font-semibold", agent.color)}>
                  {agent.label}
                </span>
                <span
                  className={cn(
                    "w-2 h-2 rounded-full",
                    errorCount > 0
                      ? "bg-accent-red"
                      : latestAction?.state === "completed"
                        ? "bg-accent-green"
                        : "bg-accent-yellow"
                  )}
                />
              </div>
              <div className="flex items-center gap-3 text-xs font-mono text-muted">
                <span className="flex items-center gap-1">
                  <Activity className="w-3 h-3" />
                  {totalActions}
                </span>
                {errorCount > 0 && (
                  <span className="flex items-center gap-1 text-accent-red">
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
        <h2 className="text-xs font-mono font-semibold text-muted uppercase tracking-wider mb-3">
          Recent Activity
        </h2>
        <div className="border border-border rounded-lg bg-terminal-card overflow-hidden">
          {data.recentActions.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm font-mono text-muted">No agent activity yet</p>
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
                            ? "bg-accent-green"
                            : action.state === "error"
                              ? "bg-accent-red"
                              : "bg-accent-yellow"
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
                    <div className="flex items-center gap-4 text-xs font-mono text-muted">
                      {action.state === "completed" && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-accent-green" />
                      )}
                      {action.state === "error" && (
                        <span className="text-accent-red" title={action.error || ""}>
                          {action.error?.slice(0, 40)}...
                        </span>
                      )}
                      {action.durationMs && (
                        <span>{action.durationMs}ms</span>
                      )}
                      <span className="text-muted/60">
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
