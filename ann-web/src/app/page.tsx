import Link from "next/link";
import { ArrowUpRight, Clock, Flame, TrendingUp, Zap, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { NewsletterSignup } from "@/components/shared/NewsletterSignup";
import { CATEGORIES } from "@/types";
import type { Article, Category } from "@/types";
import { formatDate } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { PUBLIC_STATUSES, toArticle } from "@/lib/articles";
import { getLiveNow, lineup } from "@/lib/live";

export const dynamic = "force-dynamic";

const FEATURED_COUNT = 12;
const DAY_MS = 86_400_000;

async function loadHome() {
  const now = Date.now();
  try {
    const query = (since?: Date) =>
      prisma.article.findMany({
        where: { storyStatus: { in: PUBLIC_STATUSES }, ...(since ? { publishedAt: { gte: since } } : {}) },
        orderBy: [{ scores: { overallScore: "desc" } }, { publishedAt: "desc" }],
        take: FEATURED_COUNT,
        include: { scores: true },
      });
    let rows = await query(new Date(now - 2 * DAY_MS));
    if (rows.length < 4) rows = await query();
    const [lastDay, live] = await Promise.all([
      prisma.article.count({
        where: { storyStatus: { in: PUBLIC_STATUSES }, publishedAt: { gte: new Date(now - DAY_MS) } },
      }),
      getLiveNow(new Date(now)).catch(() => null),
    ]);
    const onAir =
      live?.segments.find((s) => {
        const start = Date.parse(s.startsAt);
        return start <= now && now < start + s.durationMs;
      }) ?? null;
    return { articles: rows.map(toArticle), lastDay, onAir, ok: true };
  } catch (error) {
    console.error("Failed to load the front page:", error);
    return { articles: [] as Article[], lastDay: 0, onAir: null, ok: false };
  }
}

function categoryMeta(c: Category) {
  return CATEGORIES.find((x) => x.id === c);
}

export default async function HomePage() {
  const { articles: FEATURED, lastDay, onAir, ok } = await loadHome();
  const show = onAir ? lineup.shows.find((s) => s.id === onAir.showId) : null;
  const liveBlock = (
    <Link
      href="/live"
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border border-foreground rounded-sm px-4 py-3 hover:bg-terminal-hover transition-colors"
    >
      <span className="text-[11px] font-mono font-semibold uppercase tracking-widest">ANN Live</span>
      <span className="text-sm text-foreground/80 min-w-0">
        {onAir && show ? `${show.name}: ${onAir.title}` : "The 24-hour AI news desk"}
      </span>
      <span className="ml-auto inline-flex items-center gap-1 text-xs font-mono">
        Watch <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
      </span>
    </Link>
  );

  if (FEATURED.length === 0) {
    return (
      <div className="space-y-6">
        <header className="border-b border-border pb-5">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Signal of the day</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {ok
              ? "No stories have cleared the newsroom yet. Approved stories show up here as soon as they publish."
              : "The newsroom database is unreachable right now. Try again in a minute."}
          </p>
        </header>
        {liveBlock}
        <NewsletterSignup />
      </div>
    );
  }

  const hero = FEATURED[0];
  const top3 = FEATURED.slice(1, 4);
  const rest = FEATURED.slice(4);
  const avgSignal = Math.round(FEATURED.reduce((s, a) => s + a.scores.signalScore, 0) / FEATURED.length);
  const topScore = Math.max(...FEATURED.map((a) => a.scores.signalScore));
  const counts = new Map<Category, number>();
  FEATURED.forEach((a) => counts.set(a.category, (counts.get(a.category) ?? 0) + 1));
  const topCategory = [...counts.entries()].sort((x, y) => y[1] - x[1])[0][0];

  return (
    <div className="space-y-10">
      {/* Featured page header */}
      <header className="border-b border-border pb-5">
        <div className="flex items-center gap-2 mb-1">
          <Flame className="w-4 h-4" />
          <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Featured · Today</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Signal of the day</h1>
        <p className="text-sm text-muted-foreground mt-1">The highest-signal AI stories curated and ranked by relevance.</p>
      </header>

      {liveBlock}

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Stories, last 24h" value={lastDay} icon={<Activity className="w-3.5 h-3.5" />} />
        <StatCard label="Top signal score" value={topScore} icon={<Zap className="w-3.5 h-3.5" />} />
        <StatCard label="Avg signal" value={avgSignal} icon={<TrendingUp className="w-3.5 h-3.5" />} />
        <StatCard label="Top category" value={categoryMeta(topCategory)?.label ?? topCategory} icon={<Flame className="w-3.5 h-3.5" />} />
      </div>

      {/* Hero featured */}
      <section>
        <SectionTitle kicker="Lead story" title="Highest signal right now" />
        <Card className="border-foreground/10 hover:border-foreground/30 transition-colors group">
          <Link href={`/articles/${hero.id}`} className="block">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <Badge variant="default" className="rounded-sm">{categoryMeta(hero.category)?.label ?? hero.category}</Badge>
                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {formatDate(hero.publishedAt)}
                </span>
                <span className="text-[11px] font-mono text-muted-foreground">·</span>
                <span className="text-[11px] font-mono text-muted-foreground">{hero.source}</span>
                <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-foreground">
                  <Zap className="w-3 h-3" />
                  signal {hero.scores.signalScore}
                </span>
              </div>
              <CardTitle className="text-xl md:text-2xl leading-snug group-hover:underline underline-offset-4 decoration-foreground/30">
                {hero.title}
              </CardTitle>
              <CardDescription className="text-sm md:text-base text-foreground/70 mt-2 leading-relaxed">
                {hero.tlDr ?? hero.summary}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-border">
                <ScorePill label="builder" value={hero.scores.builderScore} />
                <ScorePill label="enterprise" value={hero.scores.enterpriseScore} />
                <ScorePill label="security" value={hero.scores.securityScore} />
                <ScorePill label="open source" value={hero.scores.openSourceScore} />
                <ScorePill label="hype" value={hero.scores.hypeScore} muted />
                <span className="ml-auto inline-flex items-center gap-1 text-xs font-mono text-foreground/60 group-hover:text-foreground transition-colors">
                  Read full <ArrowUpRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </CardContent>
          </Link>
        </Card>
      </section>

      {/* Trending row */}
      <section>
        <SectionTitle kicker="Trending" title="Top stories" right={<Link href="/feed" className="text-xs font-mono text-foreground/60 hover:text-foreground inline-flex items-center gap-1">See all <ArrowUpRight className="w-3 h-3" /></Link>} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {top3.map((a) => (
            <FeaturedCard key={a.id} article={a} />
          ))}
        </div>
      </section>

      {/* Category tabs */}
      <section>
        <SectionTitle kicker="Browse" title="By category" />
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="all">All</TabsTrigger>
            {CATEGORIES.slice(0, 6).map((c) => (
              <TabsTrigger key={c.id} value={c.id}>{c.label}</TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="all" className="mt-4">
            <ArticleList articles={FEATURED} />
          </TabsContent>
          {CATEGORIES.slice(0, 6).map((c) => (
            <TabsContent key={c.id} value={c.id} className="mt-4">
              <ArticleList articles={FEATURED.filter((a) => a.category === c.id)} fallbackLabel={c.label} />
            </TabsContent>
          ))}
        </Tabs>
      </section>

      <Separator />

      {/* More */}
      <section>
        <SectionTitle kicker="More" title="The rest of today's signal" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rest.map((a) => (
            <CompactCard key={a.id} article={a} />
          ))}
        </div>
      </section>

      <NewsletterSignup />
    </div>
  );
}

function SectionTitle({ kicker, title, right }: { kicker: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between mb-3">
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-0.5">{kicker}</div>
        <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
      </div>
      {right}
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <Card className="border-border">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1.5 text-muted-foreground">
          <span className="text-[10px] font-mono uppercase tracking-widest">{label}</span>
          <span>{icon}</span>
        </div>
        <div className="text-xl font-semibold tracking-tight text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}

function FeaturedCard({ article }: { article: Article }) {
  return (
    <Link href={`/articles/${article.id}`} className="group block h-full">
      <Card className="h-full border-border hover:border-foreground/40 transition-colors">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between mb-2">
            <Badge variant="outline" className="rounded-sm border-foreground/20">
              {CATEGORIES.find((c) => c.id === article.category)?.label ?? article.category}
            </Badge>
            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-foreground">
              <Zap className="w-3 h-3" /> {article.scores.signalScore}
            </span>
          </div>
          <CardTitle className="text-base leading-snug group-hover:underline underline-offset-4 decoration-foreground/30 line-clamp-3">
            {article.title}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <p className="text-xs text-foreground/70 line-clamp-3 leading-relaxed">{article.tlDr ?? article.summary}</p>
          <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{formatDate(article.publishedAt)}</span>
            <span>{article.source}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function CompactCard({ article }: { article: Article }) {
  return (
    <Link href={`/articles/${article.id}`} className="group block">
      <Card className="border-border hover:border-foreground/30 transition-colors">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1.5">
            <Badge variant="outline" className="rounded-sm border-foreground/20 text-[10px]">
              {CATEGORIES.find((c) => c.id === article.category)?.label ?? article.category}
            </Badge>
            <span className="text-[11px] font-mono text-muted-foreground">{formatDate(article.publishedAt)}</span>
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-foreground">
              <Zap className="w-3 h-3" />{article.scores.signalScore}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-foreground group-hover:underline underline-offset-4 decoration-foreground/30 mb-1 leading-snug">
            {article.title}
          </h3>
          <p className="text-xs text-foreground/70 line-clamp-2 leading-relaxed">{article.tlDr ?? article.summary}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

function ArticleList({ articles, fallbackLabel }: { articles: Article[]; fallbackLabel?: string }) {
  if (articles.length === 0) {
    return (
      <div className="text-sm text-muted-foreground font-mono py-8 text-center border border-dashed border-border rounded-md">
        No {fallbackLabel ? `${fallbackLabel.toLowerCase()} ` : ""}stories featured today.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {articles.map((a) => (
        <CompactCard key={a.id} article={a} />
      ))}
    </div>
  );
}

function ScorePill({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-mono ${muted ? "text-muted-foreground" : "text-foreground/80"}`}>
      <span className="opacity-60 uppercase tracking-wider">{label}</span>
      <span className="font-semibold">{value}</span>
    </span>
  );
}
