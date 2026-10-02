import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PUBLIC_STATUSES, toArticle } from "@/lib/articles";
import { getReporter } from "@/lib/newsroom";
import { aiTitle, formatDate } from "@/lib/utils";
import { Portrait } from "@/components/newsroom/Portrait";
import { StoryRow, sectionLabel } from "@/components/story/StoryRow";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function loadStory(id: string) {
  return prisma.article.findFirst({
    where: { id, storyStatus: { in: PUBLIC_STATUSES } },
    include: { scores: true },
  });
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const row = await loadStory((await params).id).catch(() => null);
  return row ? { title: row.title, description: row.tlDr ?? row.summary.slice(0, 200) } : {};
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

export default async function ArticlePage({ params }: Params) {
  const row = await loadStory((await params).id);
  if (!row) notFound();
  const article = toArticle(row);
  const reporter = getReporter(row.byline ?? "");
  const judge = (row.judge ?? {}) as Record<string, number>;
  const more = await prisma.article
    .findMany({
      where: { storyStatus: { in: PUBLIC_STATUSES }, category: row.category, id: { not: row.id } },
      orderBy: { publishedAt: "desc" },
      take: 4,
      include: { scores: true },
    })
    .then((rows) => rows.map(toArticle))
    .catch(() => []);

  const body = row.content && row.content.length > row.summary.length ? row.content : row.summary;
  const claims =
    row.verifiedClaims != null && row.unverifiedClaims != null
      ? `${row.verifiedClaims} of ${row.verifiedClaims + row.unverifiedClaims} claims matched the source`
      : null;

  return (
    <article className="flex flex-col gap-16">
      <header className="grid gap-8 border-b border-rule-strong pb-12 md:grid-cols-[192px_minmax(0,1fr)]">
        <p className="label flex flex-wrap gap-x-3 text-muted-foreground md:flex-col md:gap-1">
          <Link href={`/categories/${article.category}`} className="link tap text-foreground">
            {sectionLabel(article.category)}
          </Link>
          <span>{article.source}</span>
          <time dateTime={article.publishedAt}>{formatDate(article.publishedAt)}</time>
        </p>
        <div className="min-w-0">
          <h1 className="max-w-[22ch] text-4xl font-semibold tracking-tight">{article.title}</h1>
          {reporter && (
            <Link href={`/newsroom/${reporter.id}`} className="story-link mt-8 flex items-center gap-4">
              <Portrait look={reporter.look} name={reporter.name} size={48} />
              <span>
                <span className="headline block font-semibold">By {reporter.name}</span>
                <span className="label block text-muted-foreground">{aiTitle(reporter.title)}</span>
              </span>
            </Link>
          )}
        </div>
      </header>

      <div className="grid gap-8 md:grid-cols-[192px_minmax(0,1fr)]">
        <div aria-hidden="true" />
        <div className="flex min-w-0 max-w-[68ch] flex-col gap-6">
          {article.tlDr && <p className="text-xl leading-relaxed">{article.tlDr}</p>}
          {body
            .split(/\n{2,}/)
            .filter(Boolean)
            .map((para, i) => (
              <p key={i} className="text-lg leading-relaxed text-muted-foreground">
                {para}
              </p>
            ))}
          <p>
            <a href={article.url} target="_blank" rel="noopener noreferrer" className="button-quiet">
              Read the original at {article.source}
              <ExternalLink className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </a>
          </p>
          {article.author && <p className="label text-muted-foreground">Original reporting by {article.author}.</p>}
        </div>
      </div>

      <section aria-labelledby="checked-title" className="grid gap-8 border-t border-rule-strong pt-8 md:grid-cols-[192px_minmax(0,1fr)]">
        <h2 id="checked-title" className="label-caps text-muted-foreground">How this was checked</h2>
        <dl className="grid max-w-[68ch] items-baseline gap-x-8 gap-y-4 sm:grid-cols-[160px_minmax(0,1fr)]">
          <dt className="label text-muted-foreground">Written by</dt>
          <dd>
            {reporter ? `${reporter.name}, an AI reporter,` : "An AI reporter"} from the source text only.
          </dd>
          <dt className="label text-muted-foreground">Fact-check</dt>
          <dd>
            {row.overallConfidence != null
              ? `A second model compared the story with the source: ${percent(row.overallConfidence)} confidence.`
              : "No fact-check score was recorded for this story."}
            {claims && ` ${claims}.`}
          </dd>
          {(judge.support != null || judge.clickbait != null) && (
            <>
              <dt className="label text-muted-foreground">Classifier</dt>
              <dd>
                WaterSheep, a separate model, scored
                {judge.support != null && ` the summary ${percent(judge.support)} likely to be supported by the source`}
                {judge.support != null && judge.clickbait != null && " and"}
                {judge.clickbait != null && ` the headline ${percent(judge.clickbait)} likely to be clickbait`}.
              </dd>
            </>
          )}
          <dt className="label text-muted-foreground">People</dt>
          <dd>
            {row.humanReviewer
              ? `Approved by ${row.humanReviewer}, an ANN editor.`
              : "Published after the automated checks. No person read it before it went up."}
          </dd>
        </dl>
        <p className="label text-muted-foreground md:col-start-2">
          <Link href="/legal/ai-disclosure" className="link tap">
            How ANN uses AI
          </Link>
        </p>
      </section>

      {more.length > 0 && (
        <section aria-labelledby="more-title">
          <h2 id="more-title" className="display border-b border-rule-strong pb-4 text-4xl">
            More {sectionLabel(article.category)}
          </h2>
          <ul>
            {more.map((a) => (
              <StoryRow key={a.id} article={a} showSection={false} />
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
