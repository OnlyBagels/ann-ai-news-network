"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  HANDLE_PATTERN,
  MIN_PASSWORD,
  VIEWER_COOKIE,
  VIEWER_SESSION_SECONDS,
  accountsEnabled,
  createViewerSession,
  currentViewer,
  hashPassword,
  passwordMatches,
} from "@/lib/viewer-auth";

const QUESTIONS_PER_DAY = 3;
const QUESTION_MIN = 10;
const QUESTION_MAX = 280;

async function startSession(userId: string) {
  (await cookies()).set(VIEWER_COOKIE, createViewerSession(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && process.env.ADMIN_COOKIE_INSECURE !== "true",
    sameSite: "lax",
    path: "/",
    maxAge: VIEWER_SESSION_SECONDS,
  });
}

export async function signUp(formData: FormData) {
  if (!accountsEnabled()) redirect("/account/signup?error=off");
  const handle = String(formData.get("handle") ?? "").trim().toLowerCase().replace(/^@/, "");
  const password = String(formData.get("password") ?? "");
  if (!HANDLE_PATTERN.test(handle)) redirect("/account/signup?error=handle");
  if (password.length < MIN_PASSWORD) redirect("/account/signup?error=password");
  const taken = await prisma.user.findUnique({ where: { handle }, select: { id: true } });
  if (taken) redirect("/account/signup?error=taken");
  const user = await prisma.user.create({ data: { handle, passwordHash: await hashPassword(password) } });
  await startSession(user.id);
  redirect("/ask");
}

export async function signIn(formData: FormData) {
  if (!accountsEnabled()) redirect("/account/signin?error=off");
  const handle = String(formData.get("handle") ?? "").trim().toLowerCase().replace(/^@/, "");
  const password = String(formData.get("password") ?? "");
  const user = HANDLE_PATTERN.test(handle) ? await prisma.user.findUnique({ where: { handle } }) : null;
  if (!user || !(await passwordMatches(password, user.passwordHash))) {
    await new Promise((resolve) => setTimeout(resolve, 750)); // slow down guessing
    redirect("/account/signin?error=wrong");
  }
  await startSession(user.id);
  redirect("/ask");
}

export async function signOut() {
  (await cookies()).delete(VIEWER_COOKIE);
  redirect("/ask");
}

export async function askQuestion(formData: FormData) {
  const viewer = await currentViewer();
  if (!viewer) redirect("/account/signin");
  const text = String(formData.get("question") ?? "").replace(/\s+/g, " ").trim();
  if (text.length < QUESTION_MIN || text.length > QUESTION_MAX) redirect("/ask?error=length");
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await prisma.viewerQuestion.count({ where: { userId: viewer.id, createdAt: { gte: since } } });
  if (recent >= QUESTIONS_PER_DAY) redirect("/ask?error=limit");
  await prisma.viewerQuestion.create({ data: { userId: viewer.id, text } });
  redirect("/ask?sent=1");
}
