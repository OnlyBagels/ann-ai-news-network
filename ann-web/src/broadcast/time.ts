// The channel runs on US Eastern time. These helpers turn the grid's
// Eastern hours into real instants, daylight saving included.

export const CHANNEL_TZ = "America/New_York";

function parts(ms: number): { y: number; m: number; d: number; h: number; min: number } {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: CHANNEL_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute") };
}

/** The hour of the day in Eastern time at `ms`. */
export function easternHour(ms: number): number {
  return parts(ms).h;
}

/** The instant (UTC ms) of hour `hour` Eastern on the Eastern calendar day `dayOffset` days from `ms`'s day. */
export function easternInstant(ms: number, hour: number, dayOffset = 0): number {
  const p = parts(ms);
  // Guess as if Eastern were UTC, then correct by the zone's offset at that guess (twice, for DST edges).
  let guess = Date.UTC(p.y, p.m - 1, p.d + dayOffset, hour, 0, 0);
  for (let i = 0; i < 2; i++) {
    const q = parts(guess);
    const asUtc = Date.UTC(q.y, q.m - 1, q.d, q.h, q.min);
    guess += Date.UTC(p.y, p.m - 1, p.d + dayOffset, hour, 0) - asUtc;
  }
  return guess;
}

/** "5 AM", "12 PM": an Eastern hour for display. */
export function easternHourLabel(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h} ${hour < 12 ? "AM" : "PM"}`;
}
