import Link from "next/link";
import { ArrowUpRight, Clock, Flame, TrendingUp, Zap, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { NewsletterSignup } from "@/components/shared/NewsletterSignup";
import { SectionNav } from "@/components/layout/SectionNav";
import { CATEGORIES } from "@/types";
import type { Article, Category, Section, Region, Scores } from "@/types";
import { formatDate } from "@/lib/utils";
import { prisma } from "@/lib/prisma";

// Don't statically render — articles change as soon as a draft is approved.
export const dynamic = "force-dynamic";

const EMPTY_SCORES: Scores = {
  signalScore: 0,
  hypeScore: 0,
  builderScore: 0,
  securityScore: 0,
  openSourceScore: 0,
  enterpriseScore: 0,
  overallScore: 0,
};

async function loadFeed(): Promise<Article[]> {
  const rows = await prisma.article.findMany({
    where: { storyStatus: { in: ["approved", "published"] } },
    orderBy: [
      { scores: { overallScore: "desc" } },
      { publishedAt: "desc" },
    ],
    include: { scores: true },
    take: 12,
  });

  return rows.map((a) => ({
    id: a.id,
    title: a.title,
    slug: a.slug,
    url: a.url,
    source: a.source,
    sourceUrl: a.sourceUrl ?? undefined,
    author: a.author ?? undefined,
    publishedAt: a.publishedAt.toISOString(),
    summary: a.summary,
    tlDr: a.tlDr ?? undefined,
    tags: a.tags,
    category: a.category as Category,
    section: (a.section ?? "tech") as Section,
    region: (a.region ?? "global") as Region,
    subCategory: a.subCategory ?? undefined,
    scores: a.scores
      ? {
          signalScore: a.scores.signalScore,
          hypeScore: a.scores.hypeScore,
          builderScore: a.scores.builderScore,
          securityScore: a.scores.securityScore,
          openSourceScore: a.scores.openSourceScore,
          enterpriseScore: a.scores.enterpriseScore,
          overallScore: a.scores.overallScore,
        }
      : EMPTY_SCORES,
    imageUrl: a.imageUrl ?? undefined,
  }));
}

function categoryMeta(c: Category) {
  return CATEGORIES.find((x) => x.id === c);
}

export default async function HomePage() {
  const articles = await loadFeed();

  if (articles.length === 0) {
    return <EmptyState />;
  }

  const hero = articles[0];
  const top3 = articles.slice(1, 4);
  const rest = articles.slice(4);

  const todayCount = articles.length;
  const avgSignal = Math.round(
    articles.reduce((s, a) => s + a.scores.signalScore, 0) / articles.length
  );
  const topScore = Math.max(...articles.map((a) => a.scores.signalScore));
  const topCategory = articles[0].category;

  return (
    <div className="space-y-10">
      {/* Section navigation strip */}
      <SectionNav />

      {/* Featured page header */}
      <header className="border-b border-border pb-5">
        <div className="flex items-center gap-2 mb-1">
          <Flame className="w-4 h-4" />
          <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Featured · Today</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Signal of the day</h1>
        <p className="text-sm text-muted-foreground mt-1">The highest-signal AI stories curated and ranked by relevance.</p>
      </header>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Signals today" value={todayCount} icon={<Activity className="w-3.5 h-3.5" />} />
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
      {top3.length > 0 && (
        <section>
          <SectionTitle kicker="Trending" title="Top stories" right={<Link href="/feed" className="text-xs font-mono text-foreground/60 hover:text-foreground inline-flex items-center gap-1">See all <ArrowUpRight className="w-3 h-3" /></Link>} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {top3.map((a) => (
              <FeaturedCard key={a.id} article={a} />
            ))}
          </div>
        </section>
      )}

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
            <ArticleList articles={articles} />
          </TabsContent>
          {CATEGORIES.slice(0, 6).map((c) => (
            <TabsContent key={c.id} value={c.id} className="mt-4">
              <ArticleList articles={articles.filter((a) => a.category === c.id)} fallbackLabel={c.label} />
            </TabsContent>
          ))}
        </Tabs>
      </section>

      {rest.length > 0 && (
        <>
          <Separator />
          <section>
            <SectionTitle kicker="More" title="The rest of today's signal" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {rest.map((a) => (
                <CompactCard key={a.id} article={a} />
              ))}
            </div>
          </section>
        </>
      )}

      <NewsletterSignup />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="space-y-8">
      <header className="border-b border-border pb-5">
        <div className="flex items-center gap-2 mb-1">
          <Flame className="w-4 h-4" />
          <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Featured · Today</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Signal of the day</h1>
        <p className="text-sm text-muted-foreground mt-1">The highest-signal AI stories curated and ranked by relevance.</p>
      </header>
      <Card className="border-border">
        <CardContent className="p-12 text-center space-y-2">
          <p className="text-sm font-mono text-muted-foreground">No approved articles yet.</p>
          <p className="text-xs font-mono text-muted-foreground/70">
            Drafts queue up at <Link href="/admin/review" className="underline">/admin/review</Link>.
            Approve a few to see them here.
          </p>
        </CardContent>
      </Card>
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
