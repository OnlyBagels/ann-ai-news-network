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

const FEATURED: Article[] = [
  {
    id: "f-1",
    title: "Anthropic releases Claude 4.7 — sets new SOTA on SWE-bench Verified at 82.3%",
    slug: "claude-4-7-swebench",
    url: "#",
    source: "Anthropic Blog",
    publishedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    summary: "Claude 4.7 jumps 8 points on SWE-bench Verified while reducing inference cost by 31%. Extended thinking mode is now default.",
    tlDr: "Claude 4.7 is +8pts on SWE-bench Verified (82.3%), -31% cost. Extended thinking on by default. Available in API today.",
    tags: ["claude", "anthropic", "swe-bench", "coding-ai"],
    category: "models",
    scores: { signalScore: 96, hypeScore: 71, builderScore: 94, securityScore: 82, openSourceScore: 25, enterpriseScore: 91, overallScore: 93 },
  },
  {
    id: "f-2",
    title: "Meta open-sources Llama 4 405B under permissive license — full weights, no restrictions",
    slug: "llama-4-mit",
    url: "#",
    source: "Meta AI",
    publishedAt: new Date(Date.now() - 1000 * 60 * 47).toISOString(),
    summary: "Meta drops Llama 4 with weights, training code, and dataset details. Permissive license, commercial use allowed.",
    tlDr: "Llama 4 405B is fully open. Weights + training code. Permissive license, commercial OK. Available on HuggingFace.",
    tags: ["llama", "meta", "open-source", "weights"],
    category: "open-source",
    scores: { signalScore: 94, hypeScore: 88, builderScore: 90, securityScore: 60, openSourceScore: 98, enterpriseScore: 75, overallScore: 92 },
  },
  {
    id: "f-3",
    title: "Critical RCE in PyTorch JIT compiler — CVE-2026-3124, CVSS 9.8",
    slug: "pytorch-jit-cve",
    url: "#",
    source: "NVD",
    publishedAt: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
    summary: "Remote code execution via crafted TorchScript. Affects PyTorch 2.0–2.6. Patch in 2.6.1, upgrade immediately.",
    tlDr: "CVE-2026-3124. RCE via malicious TorchScript. CVSS 9.8. PyTorch 2.0–2.6 affected. Patch 2.6.1 out.",
    tags: ["pytorch", "security", "cve", "rce"],
    category: "security",
    scores: { signalScore: 98, hypeScore: 35, builderScore: 80, securityScore: 99, openSourceScore: 70, enterpriseScore: 92, overallScore: 95 },
  },
  {
    id: "f-4",
    title: "OpenAI acquires Windsurf for $3.2B — enters AI-IDE market",
    slug: "openai-windsurf",
    url: "#",
    source: "TechCrunch",
    publishedAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    summary: "OpenAI's largest acquisition yet. Windsurf's 2M+ developers get native GPT-5 integration. Direct Cursor competitor.",
    tlDr: "OpenAI buys Windsurf for $3.2B. 2M+ devs get GPT-5. Cursor's first real competitor with platform leverage.",
    tags: ["openai", "windsurf", "acquisition", "ide"],
    category: "funding",
    scores: { signalScore: 89, hypeScore: 93, builderScore: 82, securityScore: 50, openSourceScore: 18, enterpriseScore: 86, overallScore: 86 },
  },
  {
    id: "f-5",
    title: "DeepMind AlphaFold 3 expands to protein-protein interactions — 87% accuracy on benchmark",
    slug: "alphafold3-ppi",
    url: "#",
    source: "Nature",
    publishedAt: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
    summary: "AlphaFold 3 now predicts full protein complexes. Major implications for drug discovery and synthetic biology.",
    tlDr: "AF3 predicts full protein complexes at 87% accuracy. Drug discovery + synthetic bio applications open up fast.",
    tags: ["deepmind", "alphafold", "biology", "research"],
    category: "research",
    scores: { signalScore: 91, hypeScore: 78, builderScore: 55, securityScore: 35, openSourceScore: 72, enterpriseScore: 80, overallScore: 88 },
  },
  {
    id: "f-6",
    title: "EU AI Act enforcement begins — first fines expected within 90 days",
    slug: "eu-ai-act-enforcement",
    url: "#",
    source: "European Commission",
    publishedAt: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
    summary: "EU AI Act enforcement phase active. Fines up to 7% of global revenue. High-risk AI systems must comply immediately.",
    tlDr: "EU AI Act enforcement live. Penalties up to 7% of global revenue. 90-day window before first fines hit.",
    tags: ["eu", "regulation", "compliance"],
    category: "regulation",
    scores: { signalScore: 90, hypeScore: 60, builderScore: 65, securityScore: 78, openSourceScore: 50, enterpriseScore: 94, overallScore: 87 },
  },
  {
    id: "f-7",
    title: "GitHub Copilot Workspace GA — 40% of AI-generated PRs merge without edits",
    slug: "copilot-workspace-ga",
    url: "#",
    source: "GitHub Blog",
    publishedAt: new Date(Date.now() - 1000 * 60 * 480).toISOString(),
    summary: "Copilot Workspace moves to general availability. Issue-to-PR pipeline now production-ready.",
    tlDr: "Copilot Workspace GA. Issue → PR pipeline live. 40% merge rate with no human edits. Available for all paid plans.",
    tags: ["github", "copilot", "coding-ai"],
    category: "coding-ai",
    scores: { signalScore: 87, hypeScore: 80, builderScore: 92, securityScore: 55, openSourceScore: 60, enterpriseScore: 88, overallScore: 85 },
  },
  {
    id: "f-8",
    title: "AutoGPT v5 ships with multi-model routing and sandboxed execution",
    slug: "autogpt-v5",
    url: "#",
    source: "AutoGPT",
    publishedAt: new Date(Date.now() - 1000 * 60 * 600).toISOString(),
    summary: "Major rewrite of AutoGPT. Native multi-model routing (Claude/GPT/Gemini), sandboxed execution, new A2A protocol.",
    tlDr: "AutoGPT v5: dynamic model routing, sandboxed exec, agent-to-agent protocol. Production-ready for the first time.",
    tags: ["autogpt", "agents", "frameworks"],
    category: "agents",
    scores: { signalScore: 84, hypeScore: 75, builderScore: 88, securityScore: 70, openSourceScore: 92, enterpriseScore: 62, overallScore: 82 },
  },
];

const hero = FEATURED[0];
const top3 = FEATURED.slice(1, 4);
const rest = FEATURED.slice(4);

function categoryMeta(c: Category) {
  return CATEGORIES.find((x) => x.id === c);
}

export default function HomePage() {
  const todayCount = FEATURED.length;
  const avgSignal = Math.round(FEATURED.reduce((s, a) => s + a.scores.signalScore, 0) / FEATURED.length);
  const topCategory = "models";
  const topScore = Math.max(...FEATURED.map((a) => a.scores.signalScore));

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
