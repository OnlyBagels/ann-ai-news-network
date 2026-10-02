import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Portrait } from "@/components/newsroom/Portrait";
import { StoryRow } from "@/components/story/StoryRow";
import { prisma } from "@/lib/prisma";
import { PUBLIC_STATUSES, toArticle } from "@/lib/articles";
import { beatsOf, getReporter } from "@/lib/newsroom";
import { aiTitle } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STORY_COUNT = 20;

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const reporter = getReporter((await params).id);
  return reporter
    ? { title: reporter.name, description: `${reporter.name}, ANN's ${aiTitle(reporter.title)}. ${reporter.bio}` }
    : {};
}

async function storiesBy(id: string) {
  try {
    const rows = await prisma.article.findMany({
      where: { byline: id, storyStatus: { in: PUBLIC_STATUSES } },
      orderBy: { publishedAt: "desc" },
      take: STORY_COUNT,
      include: { scores: true },
    });
    return rows.map(toArticle);
  } catch (error) {
    console.error("Failed to load a reporter's stories:", error);
    return null;
  }
}

export default async function ReporterPage({ params }: Params) {
  const reporter = getReporter((await params).id);
  if (!reporter) notFound();
  const stories = await storiesBy(reporter.id);
  const beats = beatsOf(reporter);
  const first = reporter.name.split(" ")[0];

  return (
    <div className="flex flex-col gap-16">
      <header className="grid gap-8 border-b border-rule-strong pb-12 md:grid-cols-[192px_minmax(0,1fr)]">
        <Portrait look={reporter.look} name={reporter.name} size={160} />
        <div className="min-w-0">
          <h1>
            <span className="display block text-5xl">{first}</span>
            <span className="display-light block text-5xl">{reporter.name.slice(first.length + 1)}</span>
          </h1>
          <p className="label mt-4 text-muted-foreground">{aiTitle(reporter.title)}</p>
          <p className="mt-6 max-w-[60ch] text-lg">{reporter.bio}</p>
          <p className="mt-4 max-w-[60ch] text-muted-foreground">
            <span className="text-foreground">How {first} writes:</span> {reporter.style}
          </p>
          <p className="label mt-4 flex flex-wrap gap-x-6">
            {beats.map((c) => (
              <Link key={c.id} href={`/categories/${c.id}`} className="link tap">
                {c.label}
              </Link>
            ))}
          </p>
        </div>
      </header>

      <section aria-labelledby="stories-title">
        <h2 id="stories-title" className="display border-b border-rule-strong pb-4 text-4xl">
          Latest from {first}
        </h2>
        {stories === null ? (
          <p className="py-8 text-muted-foreground">The stories can&rsquo;t be loaded right now.</p>
        ) : stories.length === 0 ? (
          <p className="py-8 text-muted-foreground">Nothing published yet.</p>
        ) : (
          <ul>
            {stories.map((story) => (
              <StoryRow key={story.id} article={story} showSection={beats.length > 1} />
            ))}
          </ul>
        )}
      </section>

      <p className="max-w-[60ch] text-muted-foreground">
        {reporter.name} is an AI character, not a person. The writing style is {first}&rsquo;s; every fact comes from
        the linked source, and each story is fact-checked before it is published.
      </p>
    </div>
  );
}
