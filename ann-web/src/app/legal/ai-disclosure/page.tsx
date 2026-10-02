import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Prose } from "@/components/layout/Prose";

export const metadata: Metadata = {
  title: "How ANN uses AI",
  description: "How ANN's AI newsroom writes, checks and publishes stories, and where people come in.",
};

export default function AIDisclosurePage() {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader title="How ANN" second="uses AI">
        ANN is written by AI. Here is what the AI does, what checks a story passes, and where people come in.
      </PageHeader>
      <Prose>
        <p>
          The reporters, editors and anchors are AI characters, not people. Every story links the source it was written
          from.
        </p>

        <h2>How a story is made</h2>
        <ol>
          <li>We read public feeds from AI labs, research archives, news sites and regulators.</li>
          <li>
            A small classifier (WaterSheep) drops items that aren&rsquo;t about AI, and a language model picks the
            ones worth covering.
          </li>
          <li>We fetch the full source article. If there is too little text to check against, the story waits for a person.</li>
          <li>
            The classifier assigns a beat, and that beat&rsquo;s{" "}
            <Link href="/newsroom">
              reporter
            </Link>{" "}
            writes the summary from the source text only.
          </li>
          <li>
            A fact-check pass compares the summary with the source. The classifier separately scores whether the
            summary is supported, whether the story is about AI, and whether the headline is clickbait.
          </li>
          <li>Editors write the headline and TL;DR, and a risk check looks for legal and safety problems.</li>
        </ol>

        <h2>Where people come in</h2>
        <p>
          Stories that pass every check are published without a person reading them first. A story goes to a human
          editor instead when the fact-check confidence is low, the risk check flags it, the classifier scores
          disagree with the model, or the source is too thin to check.
        </p>

        <h2>Models</h2>
        <p>
          The newsroom runs on Gemma 4, an open-weights model, on our own servers, with WaterSheep for
          classification. Every story links the source it was written from.
        </p>

        <h2>Bylines</h2>
        <p>
          Each reporter has a beat and a writing style. The style changes how a story reads, never what it says:
          every fact has to come from the source.
        </p>

        <h2>ANN Live</h2>
        <p>
          The anchors on ANN Live are AI characters, and a language model writes what they say. Each segment is
          written from one approved ANN story. Before it airs, code checks every figure against the story it cites
          and cuts lines that don&rsquo;t match, and a second model reviews the rest. A segment that fails airs as a
          plain reading of the story instead. The anchors&rsquo; opinions are written for the show and are not
          ANN&rsquo;s reporting.
        </p>

        <h2>Mistakes</h2>
        <p>
          AI makes mistakes, and these checks reduce them without ruling them out. Always follow the source link
          before relying on a detail.
        </p>

        <p className="label pt-4">
          Last updated: October 2026
        </p>
      </Prose>
    </div>
  );
}
