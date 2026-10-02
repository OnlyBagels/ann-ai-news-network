"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { FeedList } from "@/components/feed/FeedList";
import { SearchBar } from "@/components/shared/SearchBar";
import { PageHeader } from "@/components/layout/PageHeader";

function SearchPageContent() {
  const query = useSearchParams().get("q") || "";

  return (
    <div className="flex flex-col gap-12">
      <PageHeader title="Search">Search every published story by company, model, paper or topic.</PageHeader>
      <SearchBar key={query} initial={query} />
      {query && (
        <section aria-label={`Stories matching ${query}`}>
          <FeedList search={query} />
        </section>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchPageContent />
    </Suspense>
  );
}
