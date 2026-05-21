import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Clock, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionNav } from "@/components/layout/SectionNav";
import { SECTIONS, CATEGORIES } from "@/types";
import type { Section, Category } from "@/types";
import { formatDate } from "@/lib/utils";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function SectionPage({ params }: PageProps) {
  const { slug } = await params;

  const sectionMeta = SECTIONS.find((s) => s.id === slug);

  if (!sectionMeta) {
    return (
      <div className="space-y-10">
        <SectionNav />
        <div className="py-24 text-center space-y-3">
          <p className="text-sm font-mono text-muted-foreground">
            Unknown section: <span className="text-foreground">{slug}</span>
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-xs font-mono text-accent-cyan hover:underline"
          >
            Back to home <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    );
  }

  const rows = await prisma.article.findMany({
    where: {
      storyStatus: { in: ["approved", "published"] },
      section: slug,
    },
    orderBy: { scores: { overallScore: "desc" } },
    include: { scores: true },
    take: 15,
  });

  return (
    <div className="space-y-8">
      <SectionNav activeSlug={slug} />

      {/* Section header */}
      <header className="border-b border-border pb-5">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[11px] font-mono uppercase tracking-widest ${sectionMeta.color}`}>
            {sectionMeta.label}
          </span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
          {sectionMeta.label}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{sectionMeta.description}</p>
      </header>

      {rows.length === 0 ? (
        <EmptySection sectionLabel={sectionMeta.label} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((article) => (
            <SectionCard key={article.id} article={article} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

type ArticleRow = Awaited<ReturnType<typeof prisma.article.findMany>>[number] & {
  scores: { signalScore: number; overallScore: number } | null;
};

function SectionCard({ article }: { article: ArticleRow }) {
  const catLabel =
    CATEGORIES.find((c) => c.id === (article.category as Category))?.label ??
    article.category;

  return (
    <Link href={`/articles/${article.id}`} className="group block h-full">
      <Card className="h-full border-border hover:border-foreground/40 transition-colors">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between mb-2">
            <Badge variant="outline" className="rounded-sm border-foreground/20 text-[10px]">
              {catLabel}
            </Badge>
            {article.scores && (
              <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-foreground">
                <Zap className="w-3 h-3" />
                {article.scores.signalScore}
              </span>
            )}
          </div>
          <CardTitle className="text-sm font-semibold leading-snug group-hover:underline underline-offset-4 decoration-foreground/30 line-clamp-3">
            {article.title}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <p className="text-xs text-foreground/70 line-clamp-3 leading-relaxed">
            {article.tlDr ?? article.summary}
          </p>
          <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDate(article.publishedAt.toISOString())}
            </span>
            <span>{article.source}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function EmptySection({ sectionLabel }: { sectionLabel: string }) {
  return (
    <div className="py-24 text-center space-y-3">
      <p className="text-sm font-mono text-muted-foreground">
        No approved {sectionLabel.toLowerCase()} stories yet.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-xs font-mono text-accent-cyan hover:underline"
      >
        Back to home <ArrowUpRight className="w-3 h-3" />
      </Link>
    </div>
  );
}
