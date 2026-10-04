import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

// Viewer accounts, for sending the desk questions. Set SESSION_SECRET to a
// long random string (`openssl rand -base64 32`). With it unset, sign-up and
// sign-in are turned off: accounts fail closed, like the admin area.

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export const VIEWER_COOKIE = "ann_viewer";
export const VIEWER_SESSION_SECONDS = 30 * 24 * 60 * 60;
export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;
export const MIN_PASSWORD = 10;

function secret(): string | null {
  const s = process.env.SESSION_SECRET?.trim();
  return s && s.length >= 16 ? s : null;
}

export function accountsEnabled(): boolean {
  return secret() !== null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 32);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function passwordMatches(password: string, stored: string): Promise<boolean> {
  const [kind, saltText, hashText] = stored.split("$");
  if (kind !== "scrypt" || !saltText || !hashText) return false;
  const expected = Buffer.from(hashText, "base64url");
  const actual = await scrypt(password, Buffer.from(saltText, "base64url"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function sign(userId: string, expires: number, key: string): string {
  return createHmac("sha256", key).update(`ann-viewer:${userId}:${expires}`).digest("base64url");
}

export function createViewerSession(userId: string, now = Date.now()): string {
  const key = secret();
  if (!key) throw new Error("SESSION_SECRET is not set");
  const expires = Math.floor(now / 1000) + VIEWER_SESSION_SECONDS;
  return `${userId}.${expires}.${sign(userId, expires, key)}`;
}

export function viewerFromSession(value: string | null | undefined, now = Date.now()): string | null {
  const key = secret();
  if (!key || !value) return null;
  const [userId, expiresText, signature] = value.split(".");
  const expires = Number(expiresText);
  if (!userId || !signature || !Number.isInteger(expires) || expires * 1000 <= now) return null;
  const expected = Buffer.from(sign(userId, expires, key));
  const got = Buffer.from(signature);
  return expected.length === got.length && timingSafeEqual(expected, got) ? userId : null;
}

/** The signed-in viewer, or null. */
export async function currentViewer(): Promise<{ id: string; handle: string } | null> {
  const userId = viewerFromSession((await cookies()).get(VIEWER_COOKIE)?.value);
  if (!userId) return null;
  try {
    return await prisma.user.findUnique({ where: { id: userId }, select: { id: true, handle: true } });
  } catch {
    return null;
  }
}
