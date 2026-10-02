"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { FeedResponse } from "@/types";

async function fetchLatest(): Promise<FeedResponse> {
  const res = await fetch("/api/articles?sort=newest&limit=10");
  if (!res.ok) throw new Error("Failed to fetch headlines");
  return res.json();
}

export function Ticker() {
  const [time, setTime] = useState<string>("");
  const { data } = useQuery({ queryKey: ["ticker"], queryFn: fetchLatest, refetchInterval: 120_000 });

  useEffect(() => {
    const updateTime = () => {
      setTime(
        new Date().toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const headlines = data?.articles ?? [];
  // Two copies so the strip loops without a gap.
  const items = [...headlines, ...headlines];

  return (
    <div className="h-7 border-b border-border bg-terminal-bg/80 overflow-hidden flex items-center">
      <Link
        href="/live"
        className="flex items-center gap-2 px-2.5 h-full shrink-0 border-r border-border hover:bg-terminal-hover transition-colors"
      >
        <span className="status-dot live" aria-hidden="true" />
        <span className="text-[10px] font-mono text-accent-green font-semibold">LIVE</span>
        <span className="text-[10px] font-mono text-muted">{time}</span>
      </Link>
      <div className="flex-1 overflow-hidden relative">
        {headlines.length > 0 && (
          <div className="ticker-animate flex items-center gap-6 whitespace-nowrap" style={{ width: "fit-content" }}>
            {items.map((article, i) => (
              <Link
                key={`${article.id}-${i}`}
                href={`/articles/${article.id}`}
                tabIndex={i < headlines.length ? 0 : -1}
                aria-hidden={i >= headlines.length}
                className="flex items-center gap-1.5 text-[10px] font-mono hover:underline"
              >
                <span className="text-muted font-semibold">{article.source}</span>
                <span className="text-foreground">{article.title}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
