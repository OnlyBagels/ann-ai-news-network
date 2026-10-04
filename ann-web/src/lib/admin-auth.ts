import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

// Admin access. Set ADMIN_TOKEN to a long random string (for example
// `openssl rand -base64 32`). Editors sign in with it at /admin/login and get
// a signed session cookie; scripts send it as `Authorization: Bearer <token>`.
// With ADMIN_TOKEN unset, every admin route refuses: it fails closed.

export const ADMIN_COOKIE = "ann_admin";
export const SESSION_SECONDS = 7 * 24 * 60 * 60;

function adminToken(): string | null {
  const token = process.env.ADMIN_TOKEN?.trim();
  return token ? token : null;
}

export function adminConfigured(): boolean {
  return adminToken() !== null;
}

function sameBytes(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Compare a submitted token with ADMIN_TOKEN in constant time. */
export function tokenMatches(candidate: string | null | undefined): boolean {
  const token = adminToken();
  if (!token || !candidate) return false;
  // Hash both so the comparison doesn't leak the token's length.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return sameBytes(digest(candidate), digest(token));
}

function sign(expires: number, token: string): string {
  return createHmac("sha256", token).update(`ann-admin-session:${expires}`).digest("base64url");
}

/** A session cookie value: its expiry and a signature only the server can make. */
export function createSession(now = Date.now()): string {
  const token = adminToken();
  if (!token) throw new Error("ADMIN_TOKEN is not set");
  const expires = Math.floor(now / 1000) + SESSION_SECONDS;
  return `${expires}.${sign(expires, token)}`;
}

export function sessionValid(value: string | null | undefined, now = Date.now()): boolean {
  const token = adminToken();
  if (!token || !value) return false;
  const [expiresText, signature] = value.split(".");
  const expires = Number(expiresText);
  if (!Number.isInteger(expires) || !signature || expires * 1000 <= now) return false;
  return sameBytes(Buffer.from(signature), Buffer.from(sign(expires, token)));
}

export function isAdmin(request: NextRequest): boolean {
  if (sessionValid(request.cookies.get(ADMIN_COOKIE)?.value)) return true;
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") && tokenMatches(header.slice(7).trim());
}

/** For API route handlers: a response to send back, or null when the caller is an admin. */
export function requireAdmin(request: NextRequest): NextResponse | null {
  if (!adminConfigured()) {
    return NextResponse.json({ error: "Admin access is turned off: ADMIN_TOKEN is not set" }, { status: 503 });
  }
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Sign in at /admin/login" }, { status: 401 });
  }
  return null;
}

/** Only redirect back into the admin area, never to another site. */
export function safeNext(value: string | null | undefined): string {
  return value && value.startsWith("/admin") && !value.startsWith("//") && !value.includes("\\") ? value : "/admin";
}
