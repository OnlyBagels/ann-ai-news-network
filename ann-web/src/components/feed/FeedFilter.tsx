"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  CATEGORIES,
  COUNTRIES,
  GEO_FILTERS,
  REGIONS,
  type Category,
  type GeoFilter,
  type Region,
  type Country,
} from "@/types";
import { SlidersHorizontal } from "lucide-react";

interface FeedFilterProps {
  activeCategory?: Category;
  activeSort?: "signal" | "newest" | "trending";
  activeGeo?: GeoFilter;
  activeRegion?: Region;
  activeCountry?: Country;
}

export function FeedFilter({
  activeCategory,
  activeSort = "signal",
  activeGeo,
  activeRegion,
  activeCountry,
}: FeedFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const setParams = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value && value.trim().length > 0) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }
    params.delete("page");
    router.push(`/feed?${params.toString()}`);
  };

  const setCategory = (category?: Category) => {
    setParams({ category: category || undefined });
  };

  const setSort = (sort: "signal" | "newest" | "trending") => {
    setParams({ sort });
  };

  const setGeo = (geo?: GeoFilter) => {
    // Geo groups are high-level presets; clear lower-level selectors.
    setParams({
      geo: geo || undefined,
      region: undefined,
      country: undefined,
    });
  };

  const setRegion = (region?: Region) => {
    setParams({
      region: region || undefined,
      geo: undefined,
    });
  };

  const setCountry = (country?: Country) => {
    setParams({
      country: country || undefined,
      geo: undefined,
    });
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

      {/* Geography Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <label className="space-y-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted">Geo Group</span>
          <select
            value={activeGeo || ""}
            onChange={(e) => setGeo((e.target.value as GeoFilter) || undefined)}
            className="terminal-input w-full text-xs"
          >
            <option value="">All geographies</option>
            {GEO_FILTERS.map((geo) => (
              <option key={geo.id} value={geo.id}>
                {geo.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted">Region</span>
          <select
            value={activeRegion || ""}
            onChange={(e) => setRegion((e.target.value as Region) || undefined)}
            className="terminal-input w-full text-xs"
          >
            <option value="">All regions</option>
            {REGIONS.map((region) => (
              <option key={region.id} value={region.id}>
                {region.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted">Country</span>
          <select
            value={activeCountry || ""}
            onChange={(e) => setCountry((e.target.value as Country) || undefined)}
            className="terminal-input w-full text-xs"
          >
            <option value="">All countries</option>
            {COUNTRIES.map((country) => (
              <option key={country.id} value={country.id}>
                {country.label}
              </option>
            ))}
          </select>
        </label>
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
