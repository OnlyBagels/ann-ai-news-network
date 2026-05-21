"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { FeedCard } from "./FeedCard";
import { NewsletterSignup } from "@/components/shared/NewsletterSignup";
import type { Category, FeedResponse, Article } from "@/types";
import { Loader2 } from "lucide-react";

interface FeedListProps {
  category?: Category;
  search?: string;
  sort?: "signal" | "newest" | "trending";
}

async function fetchFeed({
  pageParam = 1,
  category,
  search,
  sort,
}: {
  pageParam: number;
  category?: string;
  search?: string;
  sort?: string;
}): Promise<FeedResponse> {
  const params = new URLSearchParams();
  params.set("page", String(pageParam));
  params.set("limit", "20");
  if (category) params.set("category", category);
  if (search) params.set("search", search);
  if (sort) params.set("sort", sort);

  const res = await fetch(`/api/articles?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch feed");
  return res.json();
}

// Demo data for when the database is not available
const DEMO_ARTICLES: Article[] = [
  {
    id: "demo-1",
    title: "Claude 4 Sonnet Achieves State-of-the-Art on HumanEval with 94.2% Pass Rate",
    slug: "claude-4-sonnet-humaneval",
    url: "https://example.com",
    source: "Anthropic Blog",
    publishedAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    summary: "Anthropic's latest model sets new benchmarks across coding and reasoning tasks.",
    tlDr: "Claude 4 Sonnet beats GPT-4o and Gemini 2.5 on every major coding benchmark. 94.2% on HumanEval, 89.7% on SWE-bench.",
    tags: ["claude", "anthropic", "benchmarks", "coding-ai"],
    category: "models",
    scores: { signalScore: 92, hypeScore: 78, builderScore: 95, securityScore: 85, openSourceScore: 30, enterpriseScore: 88, overallScore: 91 },
  },
  {
    id: "demo-2",
    title: "Meta Releases Llama 4 Under MIT License — Full Open-Weight Access",
    slug: "meta-llama-4-mit",
    url: "https://example.com",
    source: "Meta AI",
    publishedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    summary: "Meta drops Llama 4 with a permissive MIT license, no restrictions.",
    tlDr: "Llama 4 is fully open-weight under MIT. 405B params. Available on HuggingFace now. No usage restrictions.",
    tags: ["llama", "meta", "open-source", "weights"],
    category: "open_source",
    scores: { signalScore: 95, hypeScore: 88, builderScore: 90, securityScore: 60, openSourceScore: 98, enterpriseScore: 75, overallScore: 93 },
  },
  {
    id: "demo-3",
    title: "Critical: PyTorch JIT Compiler RCE Vulnerability (CVE-2025-3124)",
    slug: "pytorch-jit-rce-cve",
    url: "https://example.com",
    source: "NVD / PyTorch Security",
    publishedAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    summary: "Remote code execution in PyTorch's JIT compiler affects all versions.",
    tlDr: "CVE-2025-3124 allows RCE via malicious TorchScript. CVSS 9.8. Patch available in PyTorch 2.6.1. Upgrade immediately.",
    tags: ["pytorch", "security", "cve", "critical"],
    category: "security",
    scores: { signalScore: 98, hypeScore: 45, builderScore: 85, securityScore: 99, openSourceScore: 70, enterpriseScore: 90, overallScore: 96 },
  },
  {
    id: "demo-4",
    title: "OpenAI Acquires Windsurf IDE for $3.2B — Enters Developer Tools Market",
    slug: "openai-windsurf-acquisition",
    url: "https://example.com",
    source: "TechCrunch",
    publishedAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    summary: "OpenAI makes its largest acquisition yet, buying the AI-native IDE.",
    tlDr: "OpenAI acquires Windsurf for $3.2B in cash+stock. Windsurf's 2M+ devs will get deep GPT-5 integration. Cursor competitor.",
    tags: ["openai", "windsurf", "acquisition", "funding"],
    category: "funding",
    scores: { signalScore: 88, hypeScore: 92, builderScore: 80, securityScore: 50, openSourceScore: 20, enterpriseScore: 85, overallScore: 85 },
  },
  {
    id: "demo-5",
    title: "EU AI Act Enforcement Begins — First Fines Expected Within 90 Days",
    slug: "eu-ai-act-enforcement",
    url: "https://example.com",
    source: "European Commission",
    publishedAt: new Date(Date.now() - 1000 * 60 * 300).toISOString(),
    summary: "The EU AI Act enters enforcement phase with significant penalties.",
    tlDr: "EU AI Act enforcement starts June 2025. Fines up to 7% of global revenue. High-risk AI systems must comply immediately.",
    tags: ["eu", "regulation", "compliance", "policy"],
    category: "regulation",
    scores: { signalScore: 90, hypeScore: 65, builderScore: 70, securityScore: 80, openSourceScore: 55, enterpriseScore: 95, overallScore: 88 },
  },
  {
    id: "demo-6",
    title: "AutoGPT v5 Released — Autonomous Agent Framework with Multi-Model Routing",
    slug: "autogpt-v5-release",
    url: "https://example.com",
    source: "AutoGPT Team",
    publishedAt: new Date(Date.now() - 1000 * 60 * 400).toISOString(),
    summary: "Major rewrite of AutoGPT with native multi-model support and improved safety.",
    tlDr: "AutoGPT v5 features dynamic model routing (Claude/GPT/Gemini), sandboxed execution, and a new agent-to-agent protocol.",
    tags: ["autogpt", "agents", "frameworks", "open-source"],
    category: "agents",
    scores: { signalScore: 85, hypeScore: 80, builderScore: 88, securityScore: 65, openSourceScore: 92, enterpriseScore: 60, overallScore: 84 },
  },
  {
    id: "demo-7",
    title: "DeepMind's AlphaFold 3 Now Generates Protein-Protein Interaction Predictions",
    slug: "alphafold3-ppi",
    url: "https://example.com",
    source: "Nature / DeepMind",
    publishedAt: new Date(Date.now() - 1000 * 60 * 600).toISOString(),
    summary: "AlphaFold 3 extends to protein complexes and drug discovery applications.",
    tlDr: "AlphaFold 3 can now predict full protein complexes with 87% accuracy. Major implications for drug discovery and synthetic biology.",
    tags: ["deepmind", "alphafold", "research", "biology"],
    category: "research",
    scores: { signalScore: 94, hypeScore: 85, builderScore: 60, securityScore: 40, openSourceScore: 75, enterpriseScore: 82, overallScore: 90 },
  },
  {
    id: "demo-8",
    title: "GitHub Copilot Workspace Reaches GA — AI-Generated PRs Go Production",
    slug: "copilot-workspace-ga",
    url: "https://example.com",
    source: "GitHub Blog",
    publishedAt: new Date(Date.now() - 1000 * 60 * 900).toISOString(),
    summary: "GitHub's AI-powered development environment moves to general availability.",
    tlDr: "Copilot Workspace can now generate full PRs from issue descriptions. 40% of generated PRs merged without human edits.",
    tags: ["github", "copilot", "coding-ai", "devtools"],
    category: "coding_ai",
    scores: { signalScore: 87, hypeScore: 82, builderScore: 92, securityScore: 55, openSourceScore: 60, enterpriseScore: 90, overallScore: 86 },
  },
];

export function FeedList({ category, search, sort = "signal" }: FeedListProps) {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
  } = useInfiniteQuery({
    queryKey: ["feed", category, search, sort],
    queryFn: ({ pageParam }) =>
      fetchFeed({ pageParam, category, search, sort }),
    getNextPageParam: (lastPage) => {
      if (lastPage.page < lastPage.totalPages) {
        return lastPage.page + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border border-border rounded-sm bg-terminal-card p-4">
            <div className="skeleton h-3 w-20 mb-2" />
            <div className="skeleton h-4 w-full mb-1.5" />
            <div className="skeleton h-4 w-3/4 mb-2" />
            <div className="skeleton h-3 w-full mb-1.5" />
            <div className="flex gap-2">
              <div className="skeleton h-4 w-14" />
              <div className="skeleton h-4 w-14" />
              <div className="skeleton h-4 w-14" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // If DB is unavailable, show demo data
  if (isError) {
    const errorMsg = (error as Error)?.message || "";
    const isDbError = errorMsg.includes("database") || errorMsg.includes("connect") || errorMsg.includes("Prisma");

    if (isDbError) {
      // Filter demo articles by category/search
      let filtered = [...DEMO_ARTICLES];
      if (category) {
        filtered = filtered.filter((a) => a.category === category);
      }
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(
          (a) =>
            a.title.toLowerCase().includes(q) ||
            a.tlDr?.toLowerCase().includes(q) ||
            a.tags.some((t) => t.includes(q))
        );
      }
      // Sort
      if (sort === "newest") {
        filtered.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
      } else if (sort === "signal") {
        filtered.sort((a, b) => b.scores.signalScore - a.scores.signalScore);
      }

      if (filtered.length === 0) {
        return (
          <div className="border border-border rounded-sm bg-terminal-card p-12 text-center">
            <p className="text-sm font-mono text-muted mb-2">
              No articles found
            </p>
            <p className="text-xs text-muted/60">
              {search
                ? `No results for "${search}". Try a different search term.`
                : "Check back soon for new signals."}
            </p>
          </div>
        );
      }

      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-4 px-1">
            <span className="status-dot live" />
            <span className="text-[10px] font-mono text-accent-green uppercase tracking-wider">Demo Mode</span>
            <span className="text-[10px] font-mono text-muted/50">— Database offline, showing sample data</span>
          </div>
          {filtered.map((article, index) => (
            <div key={article.id}>
              <FeedCard article={article} />
              {index === 4 && (
                <div className="my-4">
                  <NewsletterSignup />
                </div>
              )}
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="border border-accent-red/30 rounded-sm bg-accent-red/5 p-6 text-center">
        <p className="text-sm font-mono text-accent-red mb-2">
          Error loading feed
        </p>
        <p className="text-xs text-muted">
          {errorMsg || "An unexpected error occurred."}
        </p>
      </div>
    );
  }

  const articles = data?.pages.flatMap((page) => page.articles) ?? [];

  if (articles.length === 0) {
    return (
      <div className="border border-border rounded-sm bg-terminal-card p-12 text-center">
        <p className="text-sm font-mono text-muted mb-2">
          No articles found
        </p>
        <p className="text-xs text-muted/60">
          {search
            ? `No results for "${search}". Try a different search term.`
            : "Check back soon for new signals."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {articles.map((article, index) => (
        <div key={article.id}>
          <FeedCard article={article} />
          {/* Insert newsletter signup after 5th article */}
          {index === 4 && (
            <div className="my-4">
              <NewsletterSignup />
            </div>
          )}
        </div>
      ))}

      {/* Load more */}
      {hasNextPage && (
        <div className="flex justify-center py-6">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="px-6 py-2.5 text-sm font-mono text-accent-cyan border border-accent-cyan/30 rounded-md hover:bg-accent-cyan/10 transition-colors disabled:opacity-50"
          >
            {isFetchingNextPage ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading...
              </span>
            ) : (
              "Load More Signals"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
