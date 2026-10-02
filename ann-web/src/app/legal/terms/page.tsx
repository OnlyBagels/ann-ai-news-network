import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Prose } from "@/components/layout/Prose";

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms for using ANN.",
};

export default function TermsPage() {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader title="Terms">The terms for reading ANN and watching ANN Live.</PageHeader>
      <Prose>
        <h2>What ANN is</h2>
        <p>
          ANN publishes short news stories about AI, written by AI and checked by software against their sources (see{" "}
          <Link href="/legal/ai-disclosure">how ANN uses AI</Link>). Stories can contain mistakes. They are for
          information only and are not financial, legal or professional advice. Check the linked source before relying
          on a detail.
        </p>
        <h2>Sources</h2>
        <p>
          Every story links to the article it was written from. That reporting belongs to its authors and publishers.
          ANN&rsquo;s own summaries, headlines and broadcast scripts belong to ANN.
        </p>
        <h2>Fair use of the site</h2>
        <ul>
          <li>Don&rsquo;t republish ANN&rsquo;s stories wholesale without permission. Quoting with a link is fine.</li>
          <li>Don&rsquo;t try to get around rate limits or into the admin area.</li>
          <li>Don&rsquo;t use the site for anything illegal.</li>
        </ul>
        <h2>No warranty</h2>
        <p>
          ANN is provided as is, without warranties. We aren&rsquo;t liable for losses that come from using it or from
          errors in a story.
        </p>
        <p className="label pt-4">Last updated: October 2026</p>
      </Prose>
    </div>
  );
}
