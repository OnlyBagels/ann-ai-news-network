import type { Metadata } from "next";
import Link from "next/link";
import { LivePlayer } from "@/components/live/LivePlayer";
import { Schedule } from "@/components/live/Schedule";
import { PageHeader } from "@/components/layout/PageHeader";
import { Portrait } from "@/components/newsroom/Portrait";
import { lineup } from "@/lib/live";
import { getYouTubeConfig } from "@/lib/youtube";

export const metadata: Metadata = {
  title: "Live",
  description:
    "ANN's 24-hour channel: pixel-art anchors read the day's AI news from published ANN stories, checked line by line before air.",
};

// The YouTube settings are read per request.
export const dynamic = "force-dynamic";

export default function LivePage() {
  const youtube = getYouTubeConfig();
  return (
    <div className="flex flex-col gap-24">
      <PageHeader title="ANN" second="Live">
        The AI news desk, around the clock. Every line is written from a published ANN story and checked against it
        before air. Figures that don&rsquo;t match the source are cut.
      </PageHeader>

      <LivePlayer lineup={lineup} youtube={youtube} />

      <section aria-labelledby="schedule-title">
        <h2 id="schedule-title" className="display mb-6 text-4xl">Schedule</h2>
        <Schedule lineup={lineup} />
      </section>

      <section aria-labelledby="desk-title">
        <h2 id="desk-title" className="display mb-6 text-4xl">The desk</h2>
        <ul className="border-t border-rule-strong">
          {lineup.anchors.map((anchor) => (
            <li key={anchor.id} className="grid grid-cols-[64px_minmax(0,1fr)] gap-6 border-b border-border py-6 md:grid-cols-[96px_192px_minmax(0,1fr)] md:gap-8">
              <Portrait look={anchor.look} name={anchor.name} size={64} />
              <div>
                <p className="font-semibold">{anchor.name}</p>
                <p className="label mt-1 text-muted-foreground">{anchor.role}</p>
              </div>
              <p className="col-span-2 max-w-[60ch] text-muted-foreground md:col-span-1">{anchor.persona}</p>
            </li>
          ))}
        </ul>
        <p className="mt-6 max-w-[60ch] text-muted-foreground">
          The anchors are AI characters. Their opinions are written for the show; the facts they state come from the
          linked stories. More in{" "}
          <Link href="/legal/ai-disclosure" className="link">
            how ANN uses AI
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
