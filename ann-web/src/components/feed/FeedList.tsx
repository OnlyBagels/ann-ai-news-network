"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { FeedCard } from "./FeedCard";
import { NewsletterSignup } from "@/components/shared/NewsletterSignup";
import type { Category, FeedResponse } from "@/types";
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

  if (isError) {
    const errorMsg = (error as Error)?.message || "An unexpected error occurred.";
    return (
      <div className="border border-accent-red/30 rounded-sm bg-accent-red/5 p-6 text-center">
        <p className="text-sm font-mono text-accent-red mb-2">
          Error loading feed
        </p>
        <p className="text-xs text-muted">{errorMsg}</p>
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
          {index === 4 && (
            <div className="my-4">
              <NewsletterSignup />
            </div>
          )}
        </div>
      ))}

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
