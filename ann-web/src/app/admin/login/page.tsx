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
    <div className="max-w-sm mx-auto py-12">
      <h1 className="text-xl font-bold tracking-tight">Admin sign in</h1>
      <p className="text-sm text-muted-foreground mt-1">
        The review queue, agent logs and sources are for ANN editors.
      </p>
      {message && (
        <p role="alert" className="text-sm text-accent-red mt-4">
          {message}
        </p>
      )}
      <form action={signIn} className="mt-6 space-y-3">
        <input type="hidden" name="next" value={safeNext(next)} />
        <label htmlFor="token" className="block text-xs font-mono text-muted-foreground">
          Admin token
        </label>
        <input
          id="token"
          name="token"
          type="password"
          autoComplete="current-password"
          required
          disabled={!configured}
          className="terminal-input w-full"
        />
        <button
          type="submit"
          disabled={!configured}
          className="w-full h-10 text-sm font-mono border border-foreground rounded-sm hover:bg-terminal-hover transition-colors disabled:opacity-50"
        >
          Sign in
        </button>
      </form>
    </div>
  );
}
