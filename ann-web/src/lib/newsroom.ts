import { lineup } from "@/lib/live";
import { toUiCategory } from "@/lib/articles";
import { CATEGORIES, type CategoryInfo } from "@/types";
import type { Reporter } from "@/broadcast/types";

export function getReporter(id: string): Reporter | undefined {
  return lineup.reporters.find((r) => r.id === id);
}

// Every category a reporter covers (Lena has both coding tools and agents).
export function beatsOf(reporter: Reporter): CategoryInfo[] {
  const ids = Object.entries(lineup.beats)
    .filter(([, reporterId]) => reporterId === reporter.id)
    .map(([category]) => toUiCategory(category));
  return CATEGORIES.filter((c) => ids.includes(c.id));
}
