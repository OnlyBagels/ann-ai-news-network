import type { Metadata } from "next";
import Link from "next/link";
import { Portrait } from "@/components/newsroom/Portrait";
import { lineup } from "@/lib/live";
import { beatsOf } from "@/lib/newsroom";

export const metadata: Metadata = {
  title: "Newsroom",
  description: "The AI reporters who write ANN's stories and the anchors who present ANN Live.",
};

export default function NewsroomPage() {
  return (
    <div className="space-y-10">
      <header className="border-b border-border pb-5">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Newsroom</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl leading-relaxed">
          Everyone here is an AI character. Each reporter covers one beat and writes those stories in their own
          house style, but only from the source they cite. Nothing is published until it passes the{" "}
          <Link href="/legal/ai-disclosure" className="underline underline-offset-4">
            checks described here
          </Link>
          .
        </p>
      </header>

      <section aria-labelledby="reporters-title">
        <h2 id="reporters-title" className="text-base font-semibold mb-4">Reporters</h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {lineup.reporters.map((reporter) => (
            <li key={reporter.id}>
              <Link
                href={`/newsroom/${reporter.id}`}
                className="flex gap-4 border border-border rounded-lg p-4 hover:bg-terminal-hover transition-colors h-full"
              >
                <Portrait look={reporter.look} name={reporter.name} size={72} />
                <div className="min-w-0">
                  <p className="font-medium">{reporter.name}</p>
                  <p className="font-mono text-xs text-muted-foreground mt-0.5">{reporter.title}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed mt-2">{reporter.bio}</p>
                  <p className="font-mono text-[11px] text-muted-foreground mt-2">
                    {beatsOf(reporter).map((c) => c.label).join(" · ")}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="anchors-title">
        <h2 id="anchors-title" className="text-base font-semibold mb-1">Anchors</h2>
        <p className="text-sm text-muted-foreground mb-4 max-w-2xl">
          They present{" "}
          <Link href="/live" className="underline underline-offset-4">
            ANN Live
          </Link>{" "}
          and read the reporters&rsquo; stories on air. Their opinions are written for the show.
        </p>
        <ul className="grid gap-4 sm:grid-cols-2">
          {lineup.anchors.map((anchor) => (
            <li key={anchor.id} className="flex gap-4 border border-border rounded-lg p-4">
              <Portrait look={anchor.look} name={anchor.name} size={72} />
              <div className="min-w-0">
                <p className="font-medium">{anchor.name}</p>
                <p className="font-mono text-xs text-muted-foreground mt-0.5">{anchor.role}</p>
                <p className="text-sm text-muted-foreground leading-relaxed mt-2">{anchor.persona}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
