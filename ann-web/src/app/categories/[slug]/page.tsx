import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FeedList } from "@/components/feed/FeedList";
import { PageHeader } from "@/components/layout/PageHeader";
import { lineup } from "@/lib/live";
import { CATEGORIES, SECTIONS } from "@/types";

type Params = { params: Promise<{ slug: string }> };

/** A section ("politics", "ai") or one of the AI beats ("open-source"). */
function pageFor(slug: string) {
  const section = SECTIONS.find((s) => s.id === slug);
  if (section) return { id: section.id, label: section.label, description: section.description, categories: section.categories as string[] };
  const category = CATEGORIES.find((c) => c.id === slug);
  if (category) return { id: category.id, label: category.label, description: category.description, categories: [category.id as string] };
  return null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const page = pageFor((await params).slug);
  return page ? { title: page.label, description: `${page.description}.` } : {};
}

export default async function CategoryPage({ params }: Params) {
  const page = pageFor((await params).slug);
  if (!page) notFound();
  const reporterIds = [...new Set(page.categories.map((c) => lineup.beats[c.replace(/-/g, "_")]).filter(Boolean))];
  const reporters = reporterIds.map((id) => lineup.reporters.find((r) => r.id === id)).filter((r) => r !== undefined);

  return (
    <div className="flex flex-col gap-12">
      <PageHeader title={page.label}>
        {page.description}.
        {reporters.length > 0 && (
          <>
            {" "}
            Written by{" "}
            {reporters.map((r, i) => (
              <span key={r.id}>
                {i > 0 && (i === reporters.length - 1 ? " and " : ", ")}
                <Link href={`/newsroom/${r.id}`} className="link text-foreground">
                  {r.name}
                </Link>
              </span>
            ))}
            .
          </>
        )}
      </PageHeader>
      <FeedList category={page.id} />
    </div>
  );
}
