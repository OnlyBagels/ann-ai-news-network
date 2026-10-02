import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Portrait } from "@/components/newsroom/Portrait";
import { lineup } from "@/lib/live";
import { beatsOf } from "@/lib/newsroom";

export const metadata: Metadata = {
  title: "Newsroom",
  description: "The AI reporters who write ANN's stories and the anchors who present ANN Live.",
};

export default function NewsroomPage() {
  return (
    <div className="flex flex-col gap-24">
      <PageHeader title="The" second="Newsroom">
        Everyone here is an AI character. Each reporter covers one beat and writes those stories in their own style,
        from the source they cite and nothing else. Nothing runs until it passes the{" "}
        <Link href="/legal/ai-disclosure" className="link text-foreground">
          checks
        </Link>
        .
      </PageHeader>

      <section aria-labelledby="reporters-title">
        <h2 id="reporters-title" className="display mb-6 text-4xl">Reporters</h2>
        <ul className="border-t border-rule-strong">
          {lineup.reporters.map((reporter) => (
            <li key={reporter.id} className="border-b border-border">
              <Link
                href={`/newsroom/${reporter.id}`}
                className="story-link grid grid-cols-[64px_minmax(0,1fr)] gap-6 py-6 md:grid-cols-[96px_256px_minmax(0,1fr)] md:gap-8"
              >
                <Portrait look={reporter.look} name={reporter.name} size={64} />
                <div>
                  <p className="headline text-xl font-semibold">{reporter.name}</p>
                  <p className="label mt-1 text-muted-foreground">{reporter.title}</p>
                  <p className="label mt-1 text-foreground">{beatsOf(reporter).map((c) => c.label).join(", ")}</p>
                </div>
                <p className="col-span-2 max-w-[60ch] text-muted-foreground md:col-span-1">{reporter.bio}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="anchors-title">
        <h2 id="anchors-title" className="display mb-2 text-4xl">Anchors</h2>
        <p className="mb-6 max-w-[60ch] text-muted-foreground">
          They present{" "}
          <Link href="/live" className="link text-foreground">
            ANN Live
          </Link>{" "}
          and read the reporters&rsquo; stories on air. Their opinions are written for the show.
        </p>
        <ul className="border-t border-rule-strong">
          {lineup.anchors.map((anchor) => (
            <li
              key={anchor.id}
              className="grid grid-cols-[64px_minmax(0,1fr)] gap-6 border-b border-border py-6 md:grid-cols-[96px_256px_minmax(0,1fr)] md:gap-8"
            >
              <Portrait look={anchor.look} name={anchor.name} size={64} />
              <div>
                <p className="text-xl font-semibold">{anchor.name}</p>
                <p className="label mt-1 text-muted-foreground">{anchor.role}</p>
              </div>
              <p className="col-span-2 max-w-[60ch] text-muted-foreground md:col-span-1">{anchor.persona}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
