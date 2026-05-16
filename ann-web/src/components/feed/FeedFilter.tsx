"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { CATEGORIES, type Category } from "@/types";
import { SlidersHorizontal } from "lucide-react";

interface FeedFilterProps {
  activeCategory?: Category;
  activeSort?: "signal" | "newest" | "trending";
}

export function FeedFilter({ activeCategory, activeSort = "signal" }: FeedFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const setCategory = (category?: Category) => {
    const params = new URLSearchParams(searchParams.toString());
    if (category) {
      params.set("category", category);
    } else {
      params.delete("category");
    }
    params.delete("page");
    router.push(`/?${params.toString()}`);
  };

  const setSort = (sort: "signal" | "newest" | "trending") => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", sort);
    params.delete("page");
    router.push(`/?${params.toString()}`);
  };

  return (
    <div className="flex flex-col gap-3 mb-5">
      {/* Sort Controls */}
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="w-3.5 h-3.5 text-muted" />
        <div className="flex items-center gap-1 bg-terminal-card border border-border rounded-sm p-0.5">
          {(["signal", "newest", "trending"] as const).map((sort) => (
            <button
              key={sort}
              onClick={() => setSort(sort)}
              className={cn(
                "px-2.5 py-1 text-[11px] font-mono rounded transition-all",
                activeSort === sort
                  ? "bg-accent-cyan/10 text-accent-cyan"
                  : "text-muted hover:text-foreground"
              )}
            >
              {sort === "signal" ? "Top Signal" : sort === "newest" ? "Newest" : "Trending"}
            </button>
          ))}
        </div>
      </div>

      {/* Category Chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setCategory(undefined)}
          className={cn(
            "category-badge shrink-0 cursor-pointer transition-all",
            !activeCategory
              ? "bg-accent-cyan/10 text-accent-cyan border-accent-cyan/30"
              : "text-muted border-border hover:border-muted"
          )}
        >
          All
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCategory(cat.id)}
            className={cn(
              "category-badge shrink-0 cursor-pointer transition-all",
              activeCategory === cat.id
                ? `${cat.color} ${cat.color.replace("text-", "border-")}/30 bg-white/5`
                : "text-muted border-border hover:border-muted"
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>
    </div>
  );
}
