import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/sources
 * Returns all configured ingestion sources
 */
export async function GET(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const sources = await prisma.source.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        url: true,
        type: true,
        isActive: true,
        lastFetched: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ sources });
  } catch (error) {
    console.error("Failed to fetch sources:", error);
    return NextResponse.json(
      { error: "Failed to fetch sources" },
      { status: 500 }
    );
  }
}
