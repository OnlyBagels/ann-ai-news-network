"use client";

import { useState } from "react";
import Link from "next/link";
import { Send, CheckCircle2, AlertCircle, Loader2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { value: "", label: "Auto-detect" },
  { value: "world", label: "World" },
  { value: "politics", label: "Politics" },
  { value: "business", label: "Business" },
  { value: "tech", label: "Tech" },
  { value: "science", label: "Science" },
  { value: "climate", label: "Climate" },
  { value: "health", label: "Health" },
  { value: "sports", label: "Sports" },
  { value: "culture", label: "Culture" },
  { value: "opinion", label: "Opinion" },
] as const;

const REGIONS = [
  { value: "", label: "Global" },
  { value: "us", label: "United States" },
  { value: "eu", label: "Europe" },
  { value: "asia", label: "Asia" },
  { value: "latam", label: "Latin America" },
  { value: "africa", label: "Africa" },
  { value: "me", label: "Middle East" },
] as const;

const TOPIC_MAX = 500;

interface Submission {
  assignmentId: string;
  topic: string;
  section: string;
  region: string;
  submittedAt: string;
}

interface FormState {
  topic: string;
  section: string;
  region: string;
  notes: string;
}

type SubmitState =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "success"; assignmentId: string }
  | { type: "error"; message: string };

export default function AssignmentsPage() {
  const [form, setForm] = useState<FormState>({
    topic: "",
    section: "",
    region: "",
    notes: "",
  });
  const [submitState, setSubmitState] = useState<SubmitState>({ type: "idle" });
  const [recentSubmissions, setRecentSubmissions] = useState<Submission[]>([]);

  const charCount = form.topic.length;
  const topicOverLimit = charCount > TOPIC_MAX;
  const canSubmit =
    form.topic.trim().length > 0 &&
    !topicOverLimit &&
    submitState.type !== "loading";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitState({ type: "loading" });

    const payload: Record<string, string> = { topic: form.topic.trim() };
    if (form.section) payload.section = form.section;
    if (form.region) payload.region = form.region;
    if (form.notes.trim()) payload.notes = form.notes.trim();

    try {
      const res = await fetch("/api/agents/assignment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        const detail = data?.detail || data?.error || "Unknown error";
        setSubmitState({ type: "error", message: detail });
        return;
      }

      const assignmentId: string = data.assignmentId || data.assignment_id || "unknown";
      setSubmitState({ type: "success", assignmentId });
      setRecentSubmissions((prev) => [
        {
          assignmentId,
          topic: form.topic.trim(),
          section: form.section || "auto",
          region: form.region || "global",
          submittedAt: new Date().toISOString(),
        },
        ...prev.slice(0, 9), // keep last 10
      ]);
      setForm({ topic: "", section: "", region: "", notes: "" });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Network error — check connection";
      setSubmitState({ type: "error", message });
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-lg font-mono font-bold text-foreground mb-1">
          Assign Topic
        </h1>
        <p className="text-xs font-mono text-muted">
          Give the pipeline a topic to research and write — no source URL
          required. The article lands in the{" "}
          <Link
            href="/admin/review"
            className="text-accent-cyan hover:underline"
          >
            review queue
          </Link>{" "}
          when the agents finish.
        </p>
      </div>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="border border-border rounded-lg bg-terminal-card p-6 space-y-5"
      >
        {/* Topic */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="topic"
              className="text-xs font-mono font-semibold text-foreground"
            >
              Topic
              <span className="text-accent-red ml-0.5">*</span>
            </label>
            <span
              className={cn(
                "text-[10px] font-mono tabular-nums",
                topicOverLimit ? "text-accent-red" : "text-muted"
              )}
            >
              {charCount}/{TOPIC_MAX}
            </span>
          </div>
          <textarea
            id="topic"
            rows={3}
            placeholder="e.g. How AI coding tools are reshaping junior developer hiring in 2026"
            value={form.topic}
            onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
            className={cn(
              "terminal-input w-full resize-none text-sm",
              topicOverLimit && "border-accent-red/60 focus:ring-accent-red/40"
            )}
            required
          />
          {topicOverLimit && (
            <p className="text-[10px] font-mono text-accent-red">
              Topic exceeds {TOPIC_MAX} character limit — trim it before submitting.
            </p>
          )}
        </div>

        {/* Section + Region row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label
              htmlFor="section"
              className="block text-xs font-mono font-semibold text-foreground"
            >
              Section
              <span className="ml-1 text-[10px] font-mono text-muted font-normal">
                optional
              </span>
            </label>
            <select
              id="section"
              value={form.section}
              onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))}
              className="terminal-input w-full text-sm"
            >
              {SECTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="region"
              className="block text-xs font-mono font-semibold text-foreground"
            >
              Region
              <span className="ml-1 text-[10px] font-mono text-muted font-normal">
                optional
              </span>
            </label>
            <select
              id="region"
              value={form.region}
              onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
              className="terminal-input w-full text-sm"
            >
              {REGIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <label
            htmlFor="notes"
            className="block text-xs font-mono font-semibold text-foreground"
          >
            Editor notes
            <span className="ml-1 text-[10px] font-mono text-muted font-normal">
              optional
            </span>
          </label>
          <textarea
            id="notes"
            rows={2}
            placeholder="Angle, context, or specific sub-questions you want the researchers to address..."
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className="terminal-input w-full resize-none text-sm"
          />
        </div>

        {/* Feedback */}
        {submitState.type === "success" && (
          <div className="flex items-start gap-2.5 text-xs font-mono border border-accent-green/30 bg-accent-green/5 rounded-md px-3 py-2.5">
            <CheckCircle2 className="w-4 h-4 text-accent-green shrink-0 mt-0.5" />
            <div>
              <span className="text-accent-green font-semibold">Queued</span>
              <span className="text-muted ml-1.5">
                Assignment{" "}
                <span className="text-foreground">
                  {submitState.assignmentId}
                </span>{" "}
                is running through the pipeline.
              </span>
              <div className="mt-1.5">
                <Link
                  href="/admin/review"
                  className="text-accent-cyan hover:underline inline-flex items-center gap-1"
                >
                  Watch it in the review queue
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {submitState.type === "error" && (
          <div className="flex items-start gap-2.5 text-xs font-mono border border-accent-red/30 bg-accent-red/5 rounded-md px-3 py-2.5">
            <AlertCircle className="w-4 h-4 text-accent-red shrink-0 mt-0.5" />
            <div>
              <span className="text-accent-red font-semibold">Error</span>
              <span className="text-muted ml-1.5">{submitState.message}</span>
            </div>
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={!canSubmit}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-xs font-mono rounded-md border transition-all",
              canSubmit
                ? "text-accent-cyan border-accent-cyan/40 hover:bg-accent-cyan/10 active:bg-accent-cyan/20"
                : "text-muted border-border cursor-not-allowed opacity-50"
            )}
          >
            {submitState.type === "loading" ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Queuing…
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                Assign to pipeline
              </>
            )}
          </button>
        </div>
      </form>

      {/* Recent submissions (session-local) */}
      {recentSubmissions.length > 0 && (
        <section>
          <h2 className="text-xs font-mono font-semibold text-muted uppercase tracking-wider mb-3">
            This session
          </h2>
          <div className="border border-border rounded-lg bg-terminal-card overflow-hidden">
            <div className="divide-y divide-border">
              {recentSubmissions.map((sub) => (
                <div
                  key={sub.assignmentId}
                  className="flex items-start justify-between gap-4 px-4 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono text-foreground truncate">
                      {sub.topic}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      {sub.section !== "auto" && (
                        <span className="text-[10px] font-mono text-accent-cyan border border-accent-cyan/20 bg-accent-cyan/5 px-1.5 py-0.5 rounded capitalize">
                          {sub.section}
                        </span>
                      )}
                      {sub.region !== "global" && (
                        <span className="text-[10px] font-mono text-muted">
                          {sub.region.toUpperCase()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-[10px] font-mono text-muted">
                      {sub.assignmentId.slice(0, 20)}
                    </span>
                    <div className="mt-1">
                      <span className="text-[10px] font-mono text-accent-green border border-accent-green/20 bg-accent-green/5 px-1.5 py-0.5 rounded">
                        queued
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
