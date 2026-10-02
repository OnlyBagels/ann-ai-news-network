"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, SESSION_SECONDS, adminConfigured, createSession, safeNext, tokenMatches } from "@/lib/admin-auth";

export async function signIn(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));

  if (!adminConfigured() || !tokenMatches(token)) {
    // Slow down guessing.
    await new Promise((resolve) => setTimeout(resolve, 750));
    const query = new URLSearchParams({ error: adminConfigured() ? "token" : "unset", next });
    redirect(`/admin/login?${query}`);
  }

  (await cookies()).set(ADMIN_COOKIE, createSession(), {
    httpOnly: true,
    // Browsers drop Secure cookies on plain http, so only set it in production.
    secure: process.env.NODE_ENV === "production" && process.env.ADMIN_COOKIE_INSECURE !== "true",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  redirect(next);
}

export async function signOut() {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/admin/login");
}
