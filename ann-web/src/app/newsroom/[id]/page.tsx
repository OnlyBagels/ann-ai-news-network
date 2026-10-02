import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Portrait } from "@/components/newsroom/Portrait";
import { prisma } from "@/lib/prisma";
import { PUBLIC_STATUSES } from "@/lib/articles";
import { beatsOf, getReporter } from "@/lib/newsroom";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STORY_COUNT = 20;

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const reporter = getReporter((await params).id);
  return reporter
    ? { title: reporter.name, description: `${reporter.name}, ANN's AI ${reporter.title.toLowerCase()}. ${reporter.bio}` }
    : {};
}

async function storiesBy(id: string) {
  try {
    return await prisma.article.findMany({
      where: { byline: id, storyStatus: { in: PUBLIC_STATUSES } },
      orderBy: { publishedAt: "desc" },
      take: STORY_COUNT,
      select: { id: true, title: true, source: true, publishedAt: true },
    });
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

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <Link
        href="/newsroom"
        className="inline-flex items-center gap-1.5 text-sm font-mono text-muted hover:text-accent-cyan transition-colors"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Newsroom
      </Link>

      <header className="flex flex-col sm:flex-row gap-5 border-b border-border pb-6">
        <Portrait look={reporter.look} name={reporter.name} size={120} />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{reporter.name}</h1>
          <p className="font-mono text-xs text-muted-foreground mt-1">AI {reporter.title.toLowerCase()}</p>
          <p className="text-sm text-muted-foreground leading-relaxed mt-3">{reporter.bio}</p>
          <p className="text-sm text-muted-foreground leading-relaxed mt-2">
            <span className="text-foreground">How {reporter.name.split(" ")[0]} writes:</span> {reporter.style}
          </p>
          <p className="font-mono text-xs mt-3 flex flex-wrap gap-x-3 gap-y-1">
            {beats.map((c) => (
              <Link key={c.id} href={`/categories/${c.id}`} className={`underline underline-offset-4 ${c.color}`}>
                {c.label}
              </Link>
            ))}
          </p>
        </div>
      </header>

      <section aria-labelledby="stories-title">
        <h2 id="stories-title" className="text-base font-semibold mb-3">Latest stories</h2>
        {stories === null ? (
          <p className="text-sm text-muted-foreground">Stories can&rsquo;t be loaded right now.</p>
        ) : stories.length === 0 ? (
          <p className="text-sm text-muted-foreground">No published stories yet.</p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {stories.map((story) => (
              <li key={story.id}>
                <Link href={`/articles/${story.id}`} className="block py-3 hover:bg-terminal-hover transition-colors">
                  <p className="text-sm font-medium">{story.title}</p>
                  <p className="font-mono text-xs text-muted-foreground mt-0.5">
                    {story.source} · {formatDate(story.publishedAt)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-muted-foreground leading-relaxed">
        {reporter.name} is an AI character, not a person. The writing style is theirs; every fact comes from the
        linked source, and each story is fact-checked before it is published.
      </p>
    </div>
  );
}
