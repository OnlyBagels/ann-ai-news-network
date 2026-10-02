import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FeedList } from "@/components/feed/FeedList";
import { PageHeader } from "@/components/layout/PageHeader";
import { lineup } from "@/lib/live";
import { CATEGORIES, type Category } from "@/types";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const slug = (await params).slug;
  const category = CATEGORIES.find((c) => c.id === slug);
  return category ? { title: category.label, description: `${category.description}.` } : {};
}

export default async function CategoryPage({ params }: Params) {
  const slug = (await params).slug;
  const category = CATEGORIES.find((c) => c.id === slug);
  if (!category) notFound();
  const reporterId = lineup.beats[category.id.replace(/-/g, "_")];
  const reporter = lineup.reporters.find((r) => r.id === reporterId);

  return (
    <div className="flex flex-col gap-12">
      <PageHeader title={category.label}>
        {category.description}.
        {reporter && (
          <>
            {" "}
            Written by{" "}
            <Link href={`/newsroom/${reporter.id}`} className="link text-foreground">
              {reporter.name}
            </Link>
            .
          </>
        )}
      </PageHeader>
      <FeedList category={category.id as Category} />
    </div>
  );
}
