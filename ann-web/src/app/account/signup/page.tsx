import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { MIN_PASSWORD, accountsEnabled } from "@/lib/viewer-auth";
import { signUp } from "../actions";
import { AuthForm } from "../AuthForm";

export const metadata: Metadata = { title: "Make an account" };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  handle: "Handles are 3 to 20 lowercase letters, numbers or underscores.",
  password: `Passwords need at least ${MIN_PASSWORD} characters.`,
  taken: "That handle is taken. Try another.",
  off: "Accounts are turned off on this server.",
};

export default async function SignUp({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const message = !accountsEnabled() ? ERRORS.off : error ? ERRORS[error] : null;
  return (
    <div className="flex flex-col gap-12">
      <PageHeader title="Make an" second="account">
        Just a handle and a password, no email. Your handle is shown if the desk answers your question on air.
      </PageHeader>
      {message && <p role="alert" className="text-warn">{message}</p>}
      <AuthForm
        action={signUp}
        submit="Make my account"
        passwordHint={`at least ${MIN_PASSWORD} characters`}
        autoComplete="new-password"
        alt={{ href: "/account/signin", text: "Already have one? Sign in" }}
      />
    </div>
  );
}
