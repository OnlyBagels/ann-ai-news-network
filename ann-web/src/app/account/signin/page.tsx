import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { accountsEnabled } from "@/lib/viewer-auth";
import { signIn } from "../actions";
import { AuthForm } from "../AuthForm";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  wrong: "That handle and password don't match.",
  off: "Accounts are turned off on this server.",
};

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const message = !accountsEnabled() ? ERRORS.off : error ? ERRORS[error] : null;
  return (
    <div className="flex flex-col gap-12">
      <PageHeader title="Sign in">Sign in to send the desk your questions.</PageHeader>
      {message && <p role="alert" className="text-warn">{message}</p>}
      <AuthForm action={signIn} submit="Sign in" autoComplete="current-password" alt={{ href: "/account/signup", text: "New here? Make an account" }} />
    </div>
  );
}
