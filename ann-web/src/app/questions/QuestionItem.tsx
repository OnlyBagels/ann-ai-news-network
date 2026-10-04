import Link from "next/link";
import { formatDate } from "@/lib/utils";

export interface QuestionView {
  id: string;
  text: string;
  status: string;
  reason: string | null;
  answer: string | null;
  createdAt: Date;
  handle?: string;
  stories: { id: string; title: string; source: string }[];
}

const STATUS: Record<string, string> = {
  received: "Waiting for the desk",
  screened: "Not taken",
  declined: "Declined",
  answered: "Answered",
  aired: "Answered on air",
};

export function QuestionItem({ q, showStatus }: { q: QuestionView; showStatus: boolean }) {
  return (
    <li className="grid gap-2 border-b border-border py-6 md:grid-cols-[192px_minmax(0,1fr)] md:gap-8">
      <p className="label flex flex-wrap gap-x-3 text-muted-foreground md:flex-col md:gap-1">
        {q.handle && <span className="text-foreground">@{q.handle}</span>}
        {showStatus && <span className={q.status === "answered" || q.status === "aired" ? "text-brand" : ""}>{STATUS[q.status] ?? q.status}</span>}
        <time dateTime={q.createdAt.toISOString()}>{formatDate(q.createdAt)}</time>
      </p>
      <div className="min-w-0 max-w-[68ch]">
        <p className="text-xl font-semibold leading-snug">{q.text}</p>
        {q.answer && <p className="mt-3 text-lg text-muted-foreground">{q.answer}</p>}
        {!q.answer && q.reason && <p className="mt-3 text-muted-foreground">{q.reason}</p>}
        {q.stories.length > 0 && (
          <ul className="label mt-3 flex flex-col gap-1">
            {q.stories.map((s) => (
              <li key={s.id}>
                From{" "}
                <Link href={`/articles/${s.id}`} className="link">
                  {s.title}
                </Link>{" "}
                <span className="text-muted-foreground">({s.source})</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
