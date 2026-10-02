"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDate } from "@/lib/utils";

interface Source {
  id: string;
  name: string;
  url: string | null;
  type: string;
  category: string | null;
  aiOnly: boolean;
  isActive: boolean;
  lastFetched: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastItemCount: number | null;
  failures: number;
}

const CATEGORIES = ["models", "open_source", "coding_ai", "agents", "research", "security", "funding", "regulation"];

async function fetchSources(): Promise<{ sources: Source[] }> {
  const res = await fetch("/api/admin/sources");
  if (!res.ok) throw new Error("Couldn't load the sources.");
  return res.json();
}

function status(s: Source): { label: string; tone: string } {
  if (!s.isActive) return { label: "Paused", tone: "text-muted-foreground" };
  if (!s.lastFetched) return { label: "Waiting for first fetch", tone: "text-muted-foreground" };
  if (s.failures > 0) return { label: `Failing (${s.failures} in a row)`, tone: "text-brand" };
  return { label: "Healthy", tone: "text-foreground" };
}

export default function SourcesPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ["admin-sources"], queryFn: fetchSources });
  const [form, setForm] = useState({ name: "", url: "", category: "", aiOnly: false });
  const [formError, setFormError] = useState<string | null>(null);

  const toggle = useMutation({
    mutationFn: async (s: Source) => {
      const res = await fetch("/api/admin/sources", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: s.id, isActive: !s.isActive }),
      });
      if (!res.ok) throw new Error("Couldn't change the source.");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-sources"] }),
  });

  const add = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, type: "rss", category: form.category || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't add the source.");
    },
    onSuccess: () => {
      setForm({ name: "", url: "", category: "", aiOnly: false });
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ["admin-sources"] });
    },
    onError: (e: Error) => setFormError(e.message),
  });

  if (isLoading) return <p className="text-xs font-mono text-muted-foreground">Loading sources…</p>;
  if (isError || !data) return <p className="text-sm font-mono text-brand">Couldn&rsquo;t load the sources. Try again in a minute.</p>;

  const sources = data.sources;
  const failing = sources.filter((s) => s.isActive && s.failures > 0).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-mono font-bold text-foreground mb-1">Sources</h1>
        <p className="text-xs font-mono text-muted-foreground">
          {sources.filter((s) => s.isActive).length} active of {sources.length}
          {failing > 0 && <span className="text-brand"> · {failing} failing</span>} · fetched every newsroom cycle
        </p>
      </div>

      <div className="relative overflow-x-auto border border-border rounded-sm">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th scope="col" className="p-2 font-medium">Source</th>
              <th scope="col" className="p-2 font-medium">Beat</th>
              <th scope="col" className="p-2 font-medium">Status</th>
              <th scope="col" className="p-2 font-medium">Last worked</th>
              <th scope="col" className="p-2 font-medium text-right">Items</th>
              <th scope="col" className="p-2 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => {
              const st = status(s);
              return (
                <tr key={s.id} className="border-b border-border align-top">
                  <td className="p-2 min-w-[14rem]">
                    <span className="text-foreground">{s.name}</span>
                    {s.aiOnly && <span className="ml-2 text-xs text-muted-foreground">AI-only</span>}
                    <span className="block text-muted-foreground/70 break-all">{s.url ?? s.type}</span>
                    {s.lastError && s.failures > 0 && <span className="block text-brand mt-1 break-all">{s.lastError}</span>}
                  </td>
                  <td className="p-2 text-muted-foreground whitespace-nowrap">{s.category?.replace("_", " ") ?? "mixed"}</td>
                  <td className={`p-2 whitespace-nowrap ${st.tone}`}>{st.label}</td>
                  <td className="p-2 text-muted-foreground whitespace-nowrap">{s.lastSuccessAt ? formatDate(s.lastSuccessAt) : "never"}</td>
                  <td className="p-2 text-right tabular-nums">{s.lastItemCount ?? "–"}</td>
                  <td className="p-2 text-right">
                    <button
                      type="button"
                      onClick={() => toggle.mutate(s)}
                      disabled={toggle.isPending}
                      className="px-2 py-1 border border-border rounded-sm hover:border-foreground transition-colors"
                    >
                      {s.isActive ? "Pause" : "Resume"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
        className="border border-border rounded-sm p-4 space-y-3 max-w-2xl"
      >
        <h2 className="text-sm font-mono font-semibold">Add a feed</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-mono text-muted-foreground space-y-1">
            <span>Name, as read on air</span>
            <input id="source-name" required maxLength={80} value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} className="terminal-input w-full" />
          </label>
          <label className="text-xs font-mono text-muted-foreground space-y-1">
            <span>RSS or Atom address</span>
            <input id="source-url" required type="url" value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })} className="terminal-input w-full" />
          </label>
          <label className="text-xs font-mono text-muted-foreground space-y-1">
            <span>Usual beat</span>
            <select id="source-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="terminal-input w-full">
              <option value="">Mixed</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
            </select>
          </label>
          <label className="text-xs font-mono text-muted-foreground flex items-center gap-2 sm:pt-6">
            <input id="source-ai-only" type="checkbox" checked={form.aiOnly} onChange={(e) => setForm({ ...form, aiOnly: e.target.checked })} />
            <span>Every item is AI news (skip WaterSheep&rsquo;s screen, file under an AI beat)</span>
          </label>
        </div>
        {formError && <p role="alert" className="text-xs font-mono text-brand">{formError}</p>}
        <button type="submit" disabled={add.isPending}
          className="h-9 px-4 text-xs font-mono border border-foreground rounded-sm hover:bg-raised transition-colors">
          {add.isPending ? "Adding…" : "Add feed"}
        </button>
      </form>
    </div>
  );
}
