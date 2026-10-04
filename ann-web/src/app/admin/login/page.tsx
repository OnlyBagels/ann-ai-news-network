import type { Metadata } from "next";
import { adminConfigured, safeNext } from "@/lib/admin-auth";
import { signIn } from "../actions";

export const metadata: Metadata = { title: "Admin sign in" };
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  token: "That token doesn't match. Check ADMIN_TOKEN on the server and try again.",
  unset: "Admin access is turned off until ADMIN_TOKEN is set on the server.",
};

export default async function AdminLogin({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const configured = adminConfigured();
  const message = !configured ? MESSAGES.unset : error ? MESSAGES[error] : null;

  return (
    <div className="flex max-w-[480px] flex-col gap-8">
      <header className="border-b border-rule-strong pb-8">
        <h1 className="display text-5xl">Sign in</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          The review queue, agent logs and sources are for ANN editors.
        </p>
      </header>
      {message && (
        <p role="alert" className="text-warn">
          {message}
        </p>
      )}
      <form action={signIn} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={safeNext(next)} />
        <label htmlFor="token" className="label text-muted-foreground">
          Admin token
        </label>
        <input
          id="token"
          name="token"
          type="password"
          autoComplete="current-password"
          required
          disabled={!configured}
          className="field"
        />
        <button type="submit" disabled={!configured} className="button">
          Sign in
        </button>
      </form>
    </div>
  );
}
