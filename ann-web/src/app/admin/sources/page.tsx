"use client";

import { useQuery } from "@tanstack/react-query";
import { Radio, Globe, Rss, Database } from "lucide-react";
import { cn } from "@/lib/utils";

interface Source {
  id: string;
  name: string;
  url: string | null;
  type: string;
  isActive: boolean;
  lastFetched: string | null;
  createdAt: string;
}

interface SourcesResponse {
  sources: Source[];
}

async function fetchSources(): Promise<SourcesResponse> {
  const res = await fetch("/api/admin/sources");
  if (!res.ok) throw new Error("Failed to fetch sources");
  return res.json();
}

const sourceIcons: Record<string, React.ElementType> = {
  rss: Rss,
  api: Globe,
  scraper: Database,
};

const defaultSources = [
  { name: "OpenAI Blog", type: "rss", url: "https://openai.com/blog/rss.xml" },
  { name: "Anthropic Feed", type: "rss", url: "https://www.anthropic.com/feed.xml" },
  { name: "Google AI Blog", type: "rss", url: "https://blog.google/technology/ai/rss/" },
  { name: "Meta AI Blog", type: "rss", url: "https://ai.meta.com/blog/rss/" },
  { name: "DeepMind Blog", type: "rss", url: "https://deepmind.google/blog/rss.xml" },
  { name: "Mistral AI News", type: "rss", url: "https://mistral.ai/news/rss/" },
  { name: "HuggingFace Blog", type: "rss", url: "https://huggingface.co/blog/feed.xml" },
  { name: "Hacker News", type: "api", url: "https://news.ycombinator.com" },
  { name: "arXiv", type: "api", url: "https://arxiv.org" },
  { name: "GitHub Trending", type: "api", url: "https://github.com/trending" },
];

export default function SourcesPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-sources"],
    queryFn: fetchSources,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-6 w-48 mb-6" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-16 rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError) {
    // Show default sources if API not available
    return <SourcesList sources={defaultSources} />;
  }

  const sources = data?.sources?.length ? data.sources : defaultSources;
  return <SourcesList sources={sources} />;
}

function SourcesList({ sources }: { sources: Array<{ name: string; type: string; url?: string | null }> }) {
  const activeSources = sources.filter((s) => s.type !== "scraper" || true);
  const rssCount = sources.filter((s) => s.type === "rss").length;
  const apiCount = sources.filter((s) => s.type === "api").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-lg font-mono font-bold text-foreground mb-1">
          Sources
        </h1>
        <p className="text-xs font-mono text-muted">
          {sources.length} configured sources · {rssCount} RSS · {apiCount} API
        </p>
      </div>

      {/* Source Cards */}
      <div className="space-y-2">
        {activeSources.map((source, i) => {
          const Icon = sourceIcons[source.type] || Globe;
          return (
            <div
              key={i}
              className="border border-border rounded-lg bg-terminal-card p-4 hover:bg-terminal-hover transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-md bg-terminal-hover flex items-center justify-center">
                    <Icon className="w-4 h-4 text-accent-cyan" />
                  </div>
                  <div>
                    <p className="text-sm font-mono text-foreground">
                      {source.name}
                    </p>
                    {source.url && (
                      <p className="text-xs font-mono text-muted/60 mt-0.5 truncate max-w-md">
                        {source.url}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-muted uppercase tracking-wider border border-border rounded px-2 py-0.5">
                    {source.type}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs font-mono text-accent-green">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent-green" />
                    Active
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Info Box */}
      <div className="border border-accent-cyan/20 rounded-lg bg-accent-cyan/5 p-4">
        <div className="flex items-start gap-3">
          <Radio className="w-4 h-4 text-accent-cyan mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-mono text-accent-cyan font-semibold mb-1">
              Ingestion Pipeline
            </p>
            <p className="text-xs font-mono text-muted leading-relaxed">
              Sources are ingested every 15 minutes by the agent scheduler.
              Each source is fetched, deduplicated by URL, and processed
              through the full agent pipeline (reporters → research →
              fact-check → editorial → oversight → publish).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
