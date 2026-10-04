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
          <li>
            We read about 200 public feeds: wire services, public broadcasters, newspapers and specialist outlets for
            every section, from across the political spectrum.
          </li>
          <li>
            A small classifier (WaterSheep) drops items that aren&rsquo;t news reports: ads, promotions, job posts and
            opinion columns. A language model then picks the stories worth covering, favoring ones that several outlets
            are reporting, and keeps a mix of sections.
          </li>
          <li>
            For each story we find up to three other outlets reporting the same event, spread across political leans
            where we can (using Ad Fontes Media&rsquo;s ratings), and fetch every article. If there is too little text
            to check against, the story waits for a person.
          </li>
          <li>
            The classifier assigns a section, and that section&rsquo;s{" "}
            <Link href="/newsroom">reporter</Link> writes the article from those texts only. Every claim names the
            outlet it came from, quotes are word for word, and when outlets disagree the article says so.
          </li>
          <li>
            A fact-check pass compares the article with the sources. The classifier separately scores whether the
            article is supported, whether the headline is clickbait, and whether the language is loaded or one-sided.
          </li>
          <li>Editors write the headline and TL;DR, and a risk check looks for legal and safety problems.</li>
          <li>Every source is listed at the end of the story, with a link, its date and its Ad Fontes rating.</li>
        </ol>

        <h2>Where people come in</h2>
        <p>
          Stories that pass every check are published without a person reading them first. A story goes to a human
          editor instead when the fact-check confidence is low, the risk check flags it, the classifier finds the
          language loaded or the article unsupported, or the sources are too thin to check.
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

        <h2>Taking no side</h2>
        <p>
          ANN doesn&rsquo;t endorse candidates, parties or causes. Reporters are told to attribute every claim, give each
          side&rsquo;s position in its own words, and avoid loaded labels. Outlets&rsquo; political leans are shown on
          every story so you can judge the mix of sources yourself.
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
