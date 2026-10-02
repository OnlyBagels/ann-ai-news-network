"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { StoryRow } from "@/components/story/StoryRow";
import type { Category, FeedResponse } from "@/types";

interface FeedListProps {
  category?: Category;
  search?: string;
}

async function fetchFeed({
  pageParam = 1,
  category,
  search,
}: {
  pageParam: number;
  category?: string;
  search?: string;
}): Promise<FeedResponse> {
  const params = new URLSearchParams();
  params.set("page", String(pageParam));
  params.set("limit", "20");
  params.set("sort", "newest");
  if (category) params.set("category", category);
  if (search) params.set("search", search);

  const res = await fetch(`/api/articles?${params.toString()}`);
  if (!res.ok) throw new Error("The stories can't be loaded right now. Try again in a minute.");
  return res.json();
}

export function FeedList({ category, search }: FeedListProps) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, error } = useInfiniteQuery({
    queryKey: ["feed", category, search],
    queryFn: ({ pageParam }) => fetchFeed({ pageParam, category, search }),
    getNextPageParam: (lastPage) => (lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined),
    initialPageParam: 1,
    retry: false,
  });

  if (isLoading) {
    return (
      <ul aria-busy="true" aria-label="Loading stories">
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i} className="grid gap-2 border-b border-border py-6 md:grid-cols-[192px_minmax(0,1fr)] md:gap-8">
            <div className="skeleton h-4 w-24" />
            <div>
              <div className="skeleton h-6 w-3/4" />
              <div className="skeleton mt-2 h-4 w-full" />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (isError) {
    return <p className="py-12 text-lg text-muted-foreground">{(error as Error).message}</p>;
  }

  const articles = data?.pages.flatMap((page) => page.articles) ?? [];

  if (articles.length === 0) {
    return (
      <p className="py-12 text-lg text-muted-foreground">
        {search ? `Nothing matches “${search}”. Try a company, a model name or a topic.` : "No published stories here yet."}
      </p>
    );
  }

  return (
    <>
      <ul>
        {articles.map((article) => (
          <StoryRow key={article.id} article={article} showSection={!category} />
        ))}
      </ul>
      {hasNextPage && (
        <div className="pt-12">
          <button type="button" onClick={() => fetchNextPage()} disabled={isFetchingNextPage} className="button">
            {isFetchingNextPage ? "Loading" : "Older stories"}
          </button>
        </div>
      )}
    </>
  );
}
