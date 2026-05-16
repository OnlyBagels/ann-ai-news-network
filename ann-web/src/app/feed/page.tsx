"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { FeedList } from "@/components/feed/FeedList";
import { FeedFilter } from "@/components/feed/FeedFilter";
import type { Category } from "@/types";

function FeedPageContent() {
  const searchParams = useSearchParams();
  const category = (searchParams.get("category") as Category) || undefined;
  const sort = (searchParams.get("sort") as "signal" | "newest" | "trending") || "signal";
  const search = searchParams.get("search") || undefined;

  return (
    <div>
      <div className="mb-6 border-b border-border pb-5">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">Feed</div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {search ? `Search: "${search}"` : category ? `Category: ${category}` : "Signal feed"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {search ? `Results for "${search}"` : "All AI signals, ranked by relevance"}
        </p>
      </div>

      <FeedFilter activeCategory={category} activeSort={sort} />
      <FeedList category={category} sort={sort} search={search} />
    </div>
  );
}

export default function FeedPage() {
  return (
    <Suspense fallback={<p className="text-xs font-mono text-muted-foreground">Loading feed...</p>}>
      <FeedPageContent />
    </Suspense>
  );
}
