import { NextResponse } from "next/server";
import { getLiveNow } from "@/lib/live";

export const dynamic = "force-dynamic";

/**
 * GET /api/live/now
 * The segment on air and what is queued behind it, with the server's clock
 * so players can line up with the shared timeline.
 */
export async function GET() {
  try {
    const live = await getLiveNow();
    return NextResponse.json(live, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to read the broadcast timeline:", error);
    return NextResponse.json(
      { serverTime: new Date().toISOString(), segments: [] },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
