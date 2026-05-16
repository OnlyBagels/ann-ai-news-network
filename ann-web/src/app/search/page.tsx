"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { FeedList } from "@/components/feed/FeedList";
import { SearchBar } from "@/components/shared/SearchBar";

function SearchPageContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-lg font-mono font-bold text-foreground mb-4">
          Search
        </h1>
        <SearchBar />
      </div>

      {query ? (
        <>
          <div className="mb-4">
            <p className="text-xs font-mono text-muted">
              Results for: <span className="text-foreground">"{query}"</span>
            </p>
          </div>
          <FeedList search={query} />
        </>
      ) : (
        <div className="border border-border rounded-lg bg-terminal-card p-12 text-center">
          <p className="text-sm font-mono text-muted">
            Enter a search term to find articles, models, and more.
          </p>
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="max-w-3xl mx-auto"><p className="text-xs font-mono text-muted">Loading search...</p></div>}>
      <SearchPageContent />
    </Suspense>
  );
}
