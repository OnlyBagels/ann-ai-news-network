import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/ingest
 * Triggers the agent pipeline to ingest and process new stories.
 * This calls the Python agent service via HTTP.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const source = body.source || "all";
    const limit = body.limit || 10;

    // Call the Python agent service
    const agentServiceUrl =
      process.env.AGENT_SERVICE_URL || "http://localhost:8001";

    const response = await fetch(`${agentServiceUrl}/api/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, limit }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Agent service error:", errorText);
      return NextResponse.json(
        { error: "Agent service failed", detail: errorText },
        { status: 502 }
      );
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to trigger ingestion:", error);
    return NextResponse.json(
      { error: "Failed to trigger ingestion" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ingest
 * Returns the current status of the agent pipeline.
 */
export async function GET() {
  try {
    const agentServiceUrl =
      process.env.AGENT_SERVICE_URL || "http://localhost:8001";

    const response = await fetch(`${agentServiceUrl}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { status: "unavailable", agent: "offline" },
        { status: 503 }
      );
    }

    const health = await response.json();
    return NextResponse.json({
      status: "online",
      agent: health,
    });
  } catch {
    return NextResponse.json(
      { status: "unavailable", agent: "offline" },
      { status: 503 }
    );
  }
}
