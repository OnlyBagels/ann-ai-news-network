"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { FeedList } from "@/components/feed/FeedList";
import { FeedFilter } from "@/components/feed/FeedFilter";
import { GEO_FILTERS, type Category, type Country, type GeoFilter, type Region } from "@/types";

function FeedPageContent() {
  const searchParams = useSearchParams();
  const category = (searchParams.get("category") as Category) || undefined;
  const region = (searchParams.get("region") as Region) || undefined;
  const country = (searchParams.get("country") as Country) || undefined;
  const geo = (searchParams.get("geo") as GeoFilter) || undefined;
  const sort = (searchParams.get("sort") as "signal" | "newest" | "trending") || "signal";
  const search = searchParams.get("search") || undefined;
  const geoLabel = geo ? GEO_FILTERS.find((g) => g.id === geo)?.label || geo : undefined;

  return (
    <div>
      <div className="mb-6 border-b border-border pb-5">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">Feed</div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {search
            ? `Search: "${search}"`
            : geo
              ? `Geo: ${geoLabel}`
              : country
                ? `Country: ${country.toUpperCase()}`
                : region
                  ? `Region: ${region.toUpperCase()}`
                  : category
                    ? `Category: ${category}`
                    : "All news feed"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {search
            ? `Results for "${search}"`
            : "All news stories, ranked by signal and freshness"}
        </p>
      </div>

      <FeedFilter
        activeCategory={category}
        activeSort={sort}
        activeGeo={geo}
        activeRegion={region}
        activeCountry={country}
      />
      <FeedList
        category={category}
        region={region}
        country={country}
        geo={geo}
        sort={sort}
        search={search}
      />
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
