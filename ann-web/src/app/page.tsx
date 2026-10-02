import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PUBLIC_STATUSES, toArticle } from "@/lib/articles";
import { lineup } from "@/lib/live";
import { getYouTubeConfig } from "@/lib/youtube";
import { aiTitle, formatDate } from "@/lib/utils";
import { LivePlayer } from "@/components/live/LivePlayer";
import { SectionHeading, StoryRow, sectionLabel } from "@/components/story/StoryRow";
import { SECTIONS, sectionOf, type Article, type Category, type SectionInfo } from "@/types";

export const dynamic = "force-dynamic";

const LATEST_COUNT = 16;
const LEAD_WINDOW_MS = 2 * 86_400_000;

const PER_SECTION = 3;

interface FrontPage {
  lead: Article | null;
  latest: Article[];
  bySection: { section: SectionInfo; stories: Article[] }[];
  ok: boolean;
}

async function loadFrontPage(): Promise<FrontPage> {
  try {
    const where = { storyStatus: { in: PUBLIC_STATUSES } };
    // The lead is the highest-rated story of the last two days, or the newest.
    const [best, newest, recent] = await Promise.all([
      prisma.article.findFirst({
        where: { ...where, publishedAt: { gte: new Date(Date.now() - LEAD_WINDOW_MS) } },
        orderBy: [{ scores: { overallScore: "desc" } }, { publishedAt: "desc" }],
        include: { scores: true },
      }),
      prisma.article.findMany({
        where,
        orderBy: { publishedAt: "desc" },
        take: LATEST_COUNT + 1,
        include: { scores: true },
      }),
      prisma.article.findMany({ where, orderBy: { publishedAt: "desc" }, take: 300, include: { scores: true } }),
    ]);
    const leadRow = best ?? newest[0] ?? null;
    const latest = newest.filter((row) => row.id !== leadRow?.id).slice(0, LATEST_COUNT);
    const shown = new Set([leadRow?.id, ...latest.map((r) => r.id)]);
    const bySection = SECTIONS.map((section) => ({
      section,
      stories: recent
        .map(toArticle)
        .filter((a) => !shown.has(a.id) && sectionOf(a.category as Category)?.id === section.id)
        .slice(0, PER_SECTION),
    })).filter((b) => b.stories.length > 0);
    return { lead: leadRow ? toArticle(leadRow) : null, latest: latest.map(toArticle), bySection, ok: true };
  } catch (error) {
    console.error("Failed to load the front page:", error);
    return { lead: null, latest: [], bySection: [], ok: false };
  }
}

function today(): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date());
}

export default async function FrontPage() {
  const { lead, latest, bySection, ok } = await loadFrontPage();
  const youtube = getYouTubeConfig();

  return (
    <div className="flex flex-col gap-24">
      <section aria-labelledby="masthead" className="grid items-start gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div>
          <h1 id="masthead">
            <span className="display block text-5xl md:text-6xl">AI News</span>
            <span className="display-light block text-5xl md:text-6xl">Network</span>
          </h1>
          <p className="label-caps mt-6 flex items-center gap-4 text-muted-foreground">
            <span>Live desk</span>
            <span className="h-px flex-1 bg-rule-strong" aria-hidden="true" />
            <time dateTime={new Date().toISOString().slice(0, 10)}>{today()}</time>
          </p>
          <p className="mt-6 max-w-[44ch] text-lg text-muted-foreground">
            The day&rsquo;s news from everywhere: world, politics, business, sports, science and more. AI reporters write
            each story from the outlets that reported it, cite every one, and check the story against them before it
            runs.
          </p>
        </div>
        <LivePlayer lineup={lineup} youtube={youtube} variant="compact" />
      </section>

      {lead ? (
        <section aria-labelledby="lead-title">
          <Link href={`/articles/${lead.id}`} className="story-link grid gap-6 border-t border-rule-strong pt-8 md:grid-cols-[192px_minmax(0,1fr)] md:gap-8">
            <p className="label flex flex-wrap gap-x-3 text-muted-foreground md:flex-col md:gap-1">
              <span className="text-brand">Lead story</span>
              <span className="text-foreground">{sectionLabel(lead.category)}</span>
              <span>{lead.source}</span>
              <time dateTime={lead.publishedAt}>{formatDate(lead.publishedAt)}</time>
            </p>
            <div className="min-w-0">
              <h2 id="lead-title" className="headline max-w-[24ch] text-4xl font-semibold tracking-tight">
                {lead.title}
              </h2>
              {(lead.tlDr || lead.summary) && (
                <p className="mt-6 max-w-[60ch] text-lg text-muted-foreground">{lead.tlDr ?? lead.summary}</p>
              )}
              {lead.byline && (
                <p className="label mt-6 text-muted-foreground">
                  By {lead.byline.name}, {aiTitle(lead.byline.title)}
                </p>
              )}
            </div>
          </Link>
        </section>
      ) : (
        <section aria-labelledby="empty-title" className="border-t border-rule-strong pt-8">
          <h2 id="empty-title" className="text-2xl font-semibold">
            {ok ? "No stories have cleared the desk yet." : "The news desk can't be reached right now."}
          </h2>
          <p className="mt-2 text-muted-foreground">
            {ok
              ? "Stories show up here as soon as they pass the fact-check."
              : "Try again in a minute. The live desk above keeps running."}
          </p>
        </section>
      )}

      {latest.length > 0 && (
        <section aria-labelledby="latest-title">
          <SectionHeading
            id="latest-title"
            aside={
              <Link href="/feed" className="label link tap text-muted-foreground">
                Every story
              </Link>
            }
          >
            Latest
          </SectionHeading>
          <ul>
            {latest.map((article) => (
              <StoryRow key={article.id} article={article} />
            ))}
          </ul>
        </section>
      )}

      {bySection.map(({ section, stories }) => (
        <section key={section.id} aria-labelledby={`section-${section.id}`}>
          <SectionHeading
            id={`section-${section.id}`}
            aside={
              <Link href={`/categories/${section.id}`} className="label link tap text-muted-foreground">
                All {section.label}
              </Link>
            }
          >
            {section.label}
          </SectionHeading>
          <ul>
            {stories.map((article) => (
              <StoryRow key={article.id} article={article} showSection={false} />
            ))}
          </ul>
        </section>
      ))}

      <section aria-labelledby="desk-title" className="grid gap-6 md:grid-cols-[192px_minmax(0,1fr)] md:gap-8">
        <h2 id="desk-title" className="label-caps text-muted-foreground">Who writes this</h2>
        <p className="max-w-[60ch] text-lg">
          {lineup.reporters.length} AI reporters, each with a beat, and {lineup.anchors.length} anchors on the live desk.
          None of them are people. Each one writes only from the source it cites.{" "}
          <Link href="/newsroom" className="link">
            Meet the newsroom
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
