"use client";

import { useQuery } from "@tanstack/react-query";
import { Radio, Globe, Rss, Database } from "lucide-react";

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
  { name: "Reuters Top News", type: "rss", url: "https://www.reutersagency.com/feed/?best-topics=top-news&post_type=best" },
  { name: "BBC News", type: "rss", url: "https://feeds.bbci.co.uk/news/rss.xml" },
  { name: "Al Jazeera English", type: "rss", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { name: "The Guardian World", type: "rss", url: "https://www.theguardian.com/world/rss" },
  { name: "The Guardian Politics", type: "rss", url: "https://www.theguardian.com/politics/rss" },
  { name: "NPR News", type: "rss", url: "https://feeds.npr.org/1001/rss.xml" },
  { name: "Bloomberg Markets", type: "rss", url: "https://feeds.bloomberg.com/markets/news.rss" },
  { name: "The Verge", type: "rss", url: "https://www.theverge.com/rss/index.xml" },
  { name: "Nature", type: "rss", url: "https://www.nature.com/nature.rss" },
  { name: "ESPN Headlines", type: "rss", url: "https://www.espn.com/espn/rss/news" },
  { name: "Variety", type: "rss", url: "https://variety.com/feed/" },
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
