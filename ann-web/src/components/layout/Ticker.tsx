"use client";

import { useEffect, useState } from "react";

interface TickerItem {
  label: string;
  value: string;
  color: string;
}

const TICKER_ITEMS: TickerItem[] = [
  { label: "SIGNAL", value: "▲ +12.4%", color: "text-accent-green" },
  { label: "MODELS", value: "3 new today", color: "text-accent-cyan" },
  { label: "SECURITY", value: "▲ Critical: CVE-2025", color: "text-accent-red" },
  { label: "FUNDING", value: "$2.1B this week", color: "text-accent-yellow" },
  { label: "OPEN SOURCE", value: "▲ 47 new repos", color: "text-accent-green" },
  { label: "RESEARCH", value: "12 new papers", color: "text-accent-pink" },
  { label: "AGENTS", value: "▲ 8 frameworks", color: "text-accent-violet" },
  { label: "CODING AI", value: "▲ 3 new tools", color: "text-accent-blue" },
  { label: "REGULATION", value: "2 new policies", color: "text-accent-orange" },
  { label: "ENTERPRISE", value: "▲ +8.2% adoption", color: "text-accent-cyan" },
];

export function Ticker() {
  const [time, setTime] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString("en-US", {
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

  // Duplicate items for seamless scrolling
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS];

  return (
    <div className="h-7 border-b border-border bg-terminal-bg/80 overflow-hidden flex items-center">
      <div className="flex items-center gap-2 px-2.5 shrink-0 border-r border-border">
        <span className="status-dot live" />
        <span className="text-[10px] font-mono text-accent-green font-semibold">
          LIVE
        </span>
        <span className="text-[10px] font-mono text-muted">{time}</span>
      </div>
      <div className="flex-1 overflow-hidden relative">
        <div className="ticker-animate flex items-center gap-6 whitespace-nowrap" style={{ width: "fit-content" }}>
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[10px] font-mono">
              <span className="text-muted font-semibold">{item.label}</span>
              <span className={item.color}>{item.value}</span>
              <span className="text-border/50">|</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
