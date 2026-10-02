import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

const TYPES = ["rss", "hackernews", "arxiv", "github_trending", "huggingface"];
const CATEGORIES = ["models", "open_source", "coding_ai", "agents", "research", "security", "funding", "regulation"];

/**
 * GET /api/admin/sources
 * Every source the newsroom reads, with how its last fetches went.
 */
export async function GET(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const sources = await prisma.source.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] });
    return NextResponse.json({ sources });
  } catch (error) {
    console.error("Failed to fetch sources:", error);
    return NextResponse.json({ error: "Failed to fetch sources" }, { status: 500 });
  }
}

/**
 * POST /api/admin/sources  { name, url, category?, aiOnly? }
 * Adds an RSS or Atom feed. The newsroom picks it up on its next cycle.
 */
export async function POST(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const type = TYPES.includes(body.type) ? body.type : "rss";
  const category = CATEGORIES.includes(body.category) ? body.category : null;

  if (!name || name.length > 80) {
    return NextResponse.json({ error: "Give the source a name readers would recognise (up to 80 characters)." }, { status: 400 });
  }
  if (type === "rss" && !/^https?:\/\/\S+$/.test(url)) {
    return NextResponse.json({ error: "The feed address must start with http:// or https://." }, { status: 400 });
  }
  try {
    const source = await prisma.source.create({
      data: { name, url: url || null, type, category, aiOnly: Boolean(body.aiOnly), isActive: true },
    });
    return NextResponse.json({ source }, { status: 201 });
  } catch (error) {
    const duplicate = (error as { code?: string }).code === "P2002";
    return NextResponse.json(
      { error: duplicate ? "A source with that name already exists." : "Couldn't add the source." },
      { status: duplicate ? 409 : 500 }
    );
  }
}

/**
 * PATCH /api/admin/sources  { id, isActive }
 * Pauses or resumes a source.
 */
export async function PATCH(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  if (typeof body.id !== "string" || typeof body.isActive !== "boolean") {
    return NextResponse.json({ error: "id and isActive are required" }, { status: 400 });
  }
  try {
    const source = await prisma.source.update({ where: { id: body.id }, data: { isActive: body.isActive } });
    return NextResponse.json({ source });
  } catch {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }
}
