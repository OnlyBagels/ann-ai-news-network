import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { QuestionItem } from "./QuestionItem";
import { loadQuestions } from "./load";

export const metadata: Metadata = {
  title: "Viewer questions",
  description: "Questions viewers sent ANN's desk, answered from ANN's reporting.",
};
export const dynamic = "force-dynamic";

export default async function QuestionsPage() {
  const answered = await loadQuestions({ status: { in: ["answered", "aired"] } }, 50, true).catch(() => null);
  return (
    <div className="flex flex-col gap-12">
      <PageHeader title="Viewer" second="questions">
        What viewers asked the desk, and the answers, each drawn from ANN&rsquo;s stories and linked to them.{" "}
        <Link href="/ask" className="link text-foreground">Ask your own</Link>.
      </PageHeader>
      {answered === null ? (
        <p className="text-muted-foreground">The questions can&rsquo;t be loaded right now.</p>
      ) : answered.length === 0 ? (
        <p className="text-lg text-muted-foreground">No answered questions yet.</p>
      ) : (
        <ul>{answered.map((q) => <QuestionItem key={q.id} q={q} showStatus={false} />)}</ul>
      )}
    </div>
  );
}
