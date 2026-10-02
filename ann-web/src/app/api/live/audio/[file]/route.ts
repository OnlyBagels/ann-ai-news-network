import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

// Clips are named <segment id>-<line index>.wav by the broadcast engine.
const CLIP = /^[a-f0-9]{16}-\d{1,3}\.wav$/;

/**
 * GET /api/live/audio/:file
 * Serves a voiced line from BROADCAST_AUDIO_DIR (shared with ann-agents).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!CLIP.test(file)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const dir = process.env.BROADCAST_AUDIO_DIR || path.join(process.cwd(), "..", "broadcast-audio");
  try {
    const data = await readFile(path.join(dir, file));
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
