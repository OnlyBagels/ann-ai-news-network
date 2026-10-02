"use client";

import { useEffect, useState } from "react";
import type { Lineup } from "@/broadcast/types";

interface Slot {
  showId: string;
  start: number;
  end: number;
}

// Today's grid in the viewer's own time zone, starting from the slot on now.
function slotsFrom(lineup: Lineup, now: number): Slot[] {
  const day = new Date(now);
  const midnight = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  const slots: Slot[] = [];
  for (const offset of [0, 1]) {
    const base = midnight + offset * 86_400_000;
    lineup.grid.forEach((slot, i) => {
      const next = lineup.grid[i + 1]?.hourUtc ?? 24;
      slots.push({ showId: slot.show, start: base + slot.hourUtc * 3_600_000, end: base + next * 3_600_000 });
    });
  }
  const current = slots.findIndex((s) => s.start <= now && now < s.end);
  return slots.slice(current, current + lineup.grid.length);
}

const time = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

export function Schedule({ lineup }: { lineup: Lineup }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // The grid is shown in the viewer's time zone, so it renders after mount.
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);

  if (now === null) return null;
  const names = Object.fromEntries(lineup.anchors.map((a) => [a.id, a.name]));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <caption className="sr-only">The next 24 hours of ANN, in your time zone</caption>
        <thead>
          <tr className="border-b border-foreground text-left">
            <th scope="col" className="py-2 pr-4 font-mono text-xs font-medium whitespace-nowrap">Time</th>
            <th scope="col" className="py-2 pr-4 font-mono text-xs font-medium">Show</th>
            <th scope="col" className="py-2 font-mono text-xs font-medium hidden md:table-cell">At the desk</th>
          </tr>
        </thead>
        <tbody>
          {slotsFrom(lineup, now).map((slot, i) => {
            const show = lineup.shows.find((s) => s.id === slot.showId)!;
            return (
              <tr key={slot.start} className="border-b border-border align-top">
                <td className="py-2 pr-4 font-mono text-xs whitespace-nowrap">
                  {time(slot.start)}&ndash;{time(slot.end)}
                  {i === 0 && <span className="block text-[11px] text-muted-foreground">On now</span>}
                </td>
                <td className="py-2 pr-4">
                  <span className="font-medium">{show.name}</span>
                  <span className="block text-muted-foreground leading-snug">{show.blurb}</span>
                </td>
                <td className="py-2 text-muted-foreground hidden md:table-cell whitespace-nowrap">
                  {show.anchors.map((a) => names[a]).join(", ")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
