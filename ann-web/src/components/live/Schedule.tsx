"use client";

import { useEffect, useState } from "react";
import type { Lineup } from "@/broadcast/types";
import { easternInstant } from "@/broadcast/time";

interface Slot {
  showId: string;
  start: number;
  end: number;
}

// The next 24 hours of the grid (set in Eastern time), shown in the viewer's own time zone.
function slotsFrom(lineup: Lineup, now: number): Slot[] {
  const slots: Slot[] = [];
  for (const offset of [-1, 0, 1]) {
    lineup.grid.forEach((slot, i) => {
      const next = lineup.grid[i + 1];
      const start = easternInstant(now, slot.hourEt, offset);
      const end = next ? easternInstant(now, next.hourEt, offset) : easternInstant(now, lineup.grid[0].hourEt, offset + 1);
      slots.push({ showId: slot.show, start, end });
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
  const names = Object.fromEntries([...lineup.anchors, ...(lineup.reporters ?? [])].map((a) => [a.id, a.name]));

  return (
    <div className="relative overflow-x-auto">
      <table className="w-full border-collapse">
        <caption className="sr-only">The next 24 hours of ANN, in your time zone</caption>
        <thead>
          <tr className="border-b border-rule-strong text-left">
            <th scope="col" className="label-caps whitespace-nowrap py-2 pr-6 font-normal text-muted-foreground">Time</th>
            <th scope="col" className="label-caps py-2 pr-6 font-normal text-muted-foreground">Show</th>
            <th scope="col" className="label-caps hidden py-2 font-normal text-muted-foreground md:table-cell">At the desk</th>
          </tr>
        </thead>
        <tbody>
          {slotsFrom(lineup, now).map((slot, i) => {
            const show = lineup.shows.find((s) => s.id === slot.showId)!;
            return (
              <tr key={slot.start} className="border-b border-border align-top">
                <td className="label whitespace-nowrap py-4 pr-6">
                  {time(slot.start)}&ndash;{time(slot.end)}
                  {i === 0 && <span className="mt-1 block text-brand">On now</span>}
                </td>
                <td className="py-4 pr-6">
                  <span className="font-semibold">{show.name}</span>
                  <span className="mt-1 block leading-snug text-muted-foreground">{show.blurb}</span>
                </td>
                <td className="hidden whitespace-nowrap py-4 text-muted-foreground md:table-cell">
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
