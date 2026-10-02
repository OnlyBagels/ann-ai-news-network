import { NextResponse, type NextRequest } from "next/server";
import { isAdmin, requireAdmin } from "@/lib/admin-auth";

// Keeps the admin area and the ingest trigger behind ADMIN_TOKEN. Each admin
// route handler checks again on its own, so a matcher change can't open one.

const OPEN = new Set(["/admin/login"]);

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (OPEN.has(pathname)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return requireAdmin(request) ?? NextResponse.next();
  }

  if (!isAdmin(request)) {
    const login = new URL("/admin/login", request.url);
    login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/admin/:path*", "/api/ingest"],
};
