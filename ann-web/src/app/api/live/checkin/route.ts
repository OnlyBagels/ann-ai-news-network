import { NextRequest, NextResponse } from "next/server";
import { checkIn } from "@/lib/live";

/**
 * POST /api/live/checkin  { id }
 * A player tells the broadcast someone is watching. The director writes
 * nothing while no one has checked in for a few minutes.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  try {
    const ok = await checkIn(id, "web");
    return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
  } catch (error) {
    console.error("Viewer check-in failed:", error);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
