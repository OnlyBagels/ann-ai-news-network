import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { CATEGORIES, type Article } from "@/types";

export function sectionLabel(category: string): string {
  return CATEGORIES.find((c) => c.id === category)?.label ?? category;
}

// One headline in a ruled list: the meta column on the left, the headline
// and its one-line brief on the right. The whole row is the link.
export function StoryRow({ article, showSection = true }: { article: Article; showSection?: boolean }) {
  return (
    <li className="border-b border-border">
      <Link
        href={`/articles/${article.id}`}
        className="story-link grid gap-2 py-6 md:grid-cols-[192px_minmax(0,1fr)] md:gap-8"
      >
        <p className="label flex flex-wrap gap-x-3 text-muted-foreground md:flex-col md:gap-1">
          {showSection && <span className="text-foreground">{sectionLabel(article.category)}</span>}
          <span>{article.source}</span>
          <time dateTime={article.publishedAt}>{formatDate(article.publishedAt)}</time>
        </p>
        <div className="min-w-0">
          <h3 className="headline text-xl font-semibold leading-snug">{article.title}</h3>
          {(article.tlDr || article.summary) && (
            <p className="mt-2 line-clamp-2 max-w-[68ch] text-muted-foreground">{article.tlDr ?? article.summary}</p>
          )}
          {article.byline && <p className="label mt-3 text-muted-foreground">By {article.byline.name}</p>}
        </div>
      </Link>
    </li>
  );
}

export function SectionHeading({ id, children, aside }: { id: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 border-b border-rule-strong pb-4">
      <h2 id={id} className="display text-4xl">
        {children}
      </h2>
      {aside}
    </div>
  );
}
