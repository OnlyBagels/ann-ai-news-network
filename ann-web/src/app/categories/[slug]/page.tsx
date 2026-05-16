"use client";

import { useParams } from "next/navigation";
import { FeedList } from "@/components/feed/FeedList";
import { FeedFilter } from "@/components/feed/FeedFilter";
import { CATEGORIES, type Category } from "@/types";

export default function CategoryPage() {
  const params = useParams();
  const slug = params.slug as string;

  // Validate the category slug
  const category = CATEGORIES.find((c) => c.id === slug) ?? null;

  if (!category) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="border border-accent-red/30 rounded-lg bg-accent-red/5 p-8 text-center">
          <p className="text-sm font-mono text-accent-red mb-2">
            Category not found
          </p>
          <p className="text-xs text-muted">
            "{slug}" is not a valid category.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-lg font-mono font-bold text-foreground mb-1">
          {category.label}
        </h1>
        <p className="text-xs font-mono text-muted">
          {category.description}
        </p>
      </div>

      {/* Filters */}
      <FeedFilter activeCategory={category.id} />

      {/* Feed */}
      <FeedList category={category.id as Category} />
    </div>
  );
}
