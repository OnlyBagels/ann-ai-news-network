import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/agents/assignment
 *
 * Accepts a manual topic assignment from the admin UI and forwards it to
 * the ann-agents service, which builds a synthetic Story and runs the full
 * pipeline in research-first mode (no source URL required).
 *
 * Returns immediately with { assignmentId, status: "queued" } once
 * ann-agents accepts the job. The resulting article lands in
 * /admin/review via the normal publisher → /api/agents/draft flow.
 */

const SECTIONS = [
  "world",
  "politics",
  "business",
  "tech",
  "science",
  "climate",
  "health",
  "sports",
  "culture",
  "opinion",
] as const;

interface AssignmentBody {
  topic: string;
  section?: string;
  region?: string;
  category?: string;
  notes?: string;
}

export async function POST(req: NextRequest) {
  let body: AssignmentBody;
  try {
    body = (await req.json()) as AssignmentBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // Validate required field
  if (!body?.topic || typeof body.topic !== "string") {
    return NextResponse.json(
      { error: "topic is required" },
      { status: 400 }
    );
  }

  const topic = body.topic.trim();
  if (topic.length === 0) {
    return NextResponse.json(
      { error: "topic cannot be empty" },
      { status: 400 }
    );
  }
  if (topic.length > 500) {
    return NextResponse.json(
      { error: "topic exceeds 500 character limit" },
      { status: 400 }
    );
  }

  // Validate section if provided
  if (
    body.section !== undefined &&
    body.section !== "" &&
    !(SECTIONS as readonly string[]).includes(body.section)
  ) {
    return NextResponse.json(
      {
        error: `invalid section — must be one of: ${SECTIONS.join(", ")}`,
      },
      { status: 400 }
    );
  }

  const agentServiceUrl =
    process.env.AGENT_SERVICE_URL || "http://localhost:8001";
  const agentSecret = process.env.ANN_AGENT_SECRET || "";

  const forwardPayload: AssignmentBody = {
    topic,
    ...(body.section ? { section: body.section } : {}),
    ...(body.region ? { region: body.region } : {}),
    ...(body.category ? { category: body.category } : {}),
    ...(body.notes ? { notes: body.notes } : {}),
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (agentSecret) {
    headers["X-Agent-Secret"] = agentSecret;
  }

  try {
    const upstream = await fetch(`${agentServiceUrl}/api/assignment`, {
      method: "POST",
      headers,
      body: JSON.stringify(forwardPayload),
      signal: AbortSignal.timeout(10_000),
    });

    // Surface ann-agents error responses verbatim so the admin UI can
    // show a meaningful message rather than a generic 502.
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      return NextResponse.json(
        { error: "agent service error", detail },
        { status: upstream.status >= 500 ? 502 : upstream.status }
      );
    }

    const result = await upstream.json();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Timeout or connection refused — agent service is not reachable.
    if (
      message.includes("TimeoutError") ||
      message.includes("ECONNREFUSED") ||
      message.includes("fetch failed")
    ) {
      return NextResponse.json(
        {
          error: "agent service unavailable",
          detail: "ann-agents is not reachable — start the service and retry",
        },
        { status: 503 }
      );
    }

    console.error("[/api/agents/assignment] unexpected error:", err);
    return NextResponse.json(
      { error: "internal server error", detail: message },
      { status: 500 }
    );
  }
}
