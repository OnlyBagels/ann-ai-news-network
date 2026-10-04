import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { currentViewer, accountsEnabled } from "@/lib/viewer-auth";
import { askQuestion, signOut } from "../account/actions";
import { QuestionItem } from "../questions/QuestionItem";
import { loadQuestions } from "../questions/load";

export const metadata: Metadata = {
  title: "Ask the desk",
  description: "Send ANN's newsroom a question about the news. Answers come from ANN's reporting, with the stories cited.",
};
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  length: "Questions are 10 to 280 characters.",
  limit: "That's three questions in a day. Send another tomorrow.",
};

export default async function AskPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  const { error, sent } = await searchParams;
  const viewer = await currentViewer();
  const mine = viewer ? await loadQuestions({ userId: viewer.id }) : [];

  return (
    <div className="flex flex-col gap-16">
      <PageHeader title="Ask" second="the desk">
        Send the newsroom a question about the news. The desk answers from ANN&rsquo;s own reporting and cites the stories;
        the best answers are read on ANN Live with your handle.
      </PageHeader>

      {!viewer ? (
        <section className="flex flex-col gap-4">
          <p className="text-lg">
            {accountsEnabled() ? (
              <>
                <Link href="/account/signin" className="link">Sign in</Link> or{" "}
                <Link href="/account/signup" className="link">make an account</Link> to ask. It takes a handle and a password, no email.
              </>
            ) : (
              "Accounts are turned off on this server."
            )}
          </p>
        </section>
      ) : (
        <section aria-labelledby="ask-title" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <h2 id="ask-title" className="text-2xl font-semibold">Your question, @{viewer.handle}</h2>
            <form action={signOut}>
              <button type="submit" className="button-quiet">Sign out</button>
            </form>
          </div>
          {error && <p role="alert" className="text-warn">{ERRORS[error]}</p>}
          {sent && <p className="text-brand">Sent. The desk looks at new questions every few minutes.</p>}
          <form action={askQuestion} className="flex max-w-[720px] flex-col gap-4">
            <label htmlFor="question" className="sr-only">Your question</label>
            <textarea
              id="question"
              name="question"
              required
              minLength={10}
              maxLength={280}
              rows={3}
              placeholder="For example: What did the Fed decide today, and what changes for mortgages?"
              className="field"
            />
            <button type="submit" className="button self-start">Send to the desk</button>
          </form>
        </section>
      )}

      <section aria-labelledby="how-title" className="grid gap-6 border-t border-rule-strong pt-8 md:grid-cols-[192px_minmax(0,1fr)] md:gap-8">
        <h2 id="how-title" className="label-caps text-muted-foreground">How the desk decides</h2>
        <ol className="flex max-w-[68ch] list-decimal flex-col gap-2 pl-6 text-muted-foreground">
          <li>A classifier (WaterSheep) checks that it&rsquo;s a question about the news, and not abuse or about a private person.</li>
          <li>The desk&rsquo;s model decides whether ANN can answer it from reporting. It won&rsquo;t give opinions on who to vote for, or medical, legal or financial advice.</li>
          <li>It reads ANN&rsquo;s published stories on the subject and writes a short answer from them only, citing each one.</li>
          <li>The classifier checks the answer is supported by those stories before it&rsquo;s shown or read on air.</li>
        </ol>
      </section>

      {viewer && (
        <section aria-labelledby="mine-title">
          <h2 id="mine-title" className="display border-b border-rule-strong pb-4 text-4xl">Your questions</h2>
          {mine.length === 0 ? (
            <p className="py-8 text-muted-foreground">Nothing sent yet.</p>
          ) : (
            <ul>{mine.map((q) => <QuestionItem key={q.id} q={q} showStatus />)}</ul>
          )}
        </section>
      )}

      <p className="text-muted-foreground">
        <Link href="/questions" className="link">Questions the desk has answered</Link>
      </p>
    </div>
  );
}
