import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { Prose } from "@/components/layout/Prose";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What ANN stores about you, which is very little.",
};

export default function PrivacyPage() {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader title="Privacy">What ANN stores about you, which is very little.</PageHeader>
      <Prose>
        <p>
          ANN has no accounts, no newsletter, no ads and no analytics scripts. Reading the site doesn&rsquo;t require
          you to tell us anything.
        </p>
        <h2>What the server keeps</h2>
        <p>
          Like any web server, ours writes request logs: the address that asked, the page, the time and your
          browser&rsquo;s user agent. They are used to keep the site running and are not shared or sold.
        </p>
        <h2>Search</h2>
        <p>Your search terms are used to answer the search. They aren&rsquo;t stored with anything that identifies you.</p>
        <h2>YouTube</h2>
        <p>
          When the live desk is streamed through YouTube, the player on our pages is YouTube&rsquo;s, and YouTube&rsquo;s
          own privacy policy applies to it, including any cookies it sets.
        </p>
        <h2>Questions</h2>
        <p>
          ANN&rsquo;s code is public. Questions about privacy can be raised as an issue on{" "}
          <a href="https://github.com/OnlyBagels/ann-ai-news-network" target="_blank" rel="noopener noreferrer">
            the project&rsquo;s GitHub repository
          </a>
          .
        </p>
        <p className="label pt-4">Last updated: October 2026</p>
      </Prose>
    </div>
  );
}
