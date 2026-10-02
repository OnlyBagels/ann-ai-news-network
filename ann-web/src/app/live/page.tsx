import type { Metadata } from "next";
import Link from "next/link";
import { LivePlayer } from "@/components/live/LivePlayer";
import { Schedule } from "@/components/live/Schedule";
import { lineup } from "@/lib/live";
import { getYouTubeConfig } from "@/lib/youtube";

export const metadata: Metadata = {
  title: "Live",
  description:
    "ANN's 24-hour channel: pixel-art anchors read the day's AI news from approved ANN stories, checked line by line before air.",
};

// The YouTube settings are read per request.
export const dynamic = "force-dynamic";

export default function LivePage() {
  const youtube = getYouTubeConfig();
  return (
    <div className="space-y-10">
      <header className="border-b border-border pb-5">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">ANN Live</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl leading-relaxed">
          The AI news desk, around the clock. Every line is written from an approved ANN story and checked against
          it before air. Figures that don&rsquo;t match the source get cut.
        </p>
      </header>

      <LivePlayer lineup={lineup} youtube={youtube} />

      <section aria-labelledby="schedule-title">
        <h2 id="schedule-title" className="text-base font-semibold mb-3">Schedule</h2>
        <Schedule lineup={lineup} />
      </section>

      <section aria-labelledby="desk-title">
        <h2 id="desk-title" className="text-base font-semibold mb-3">The desk</h2>
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 text-sm">
          {lineup.anchors.map((anchor) => (
            <div key={anchor.id} className="border-t border-border pt-3">
              <dt className="font-medium">
                {anchor.name}
                <span className="font-mono text-xs text-muted-foreground ml-2">{anchor.role}</span>
              </dt>
              <dd className="text-muted-foreground leading-relaxed mt-1">{anchor.persona}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground mt-4 max-w-2xl leading-relaxed">
          The anchors are AI characters. Their opinions are written for the show; the facts they state come from the
          linked stories. How ANN uses AI is set out in the{" "}
          <Link href="/legal/ai-disclosure" className="underline underline-offset-4">
            AI disclosure
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
