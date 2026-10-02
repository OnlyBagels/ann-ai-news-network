"use client";

import { useEffect, useRef } from "react";
import type { AnchorLook } from "@/broadcast/types";
import { SPRITE_DESK_ROW, SPRITE_W, drawAnchor } from "@/broadcast/sprites";

// A head-and-shoulders pixel portrait, drawn with the same sprite code as
// the live channel so the newsroom page and the broadcast match.
export function Portrait({ look, name, size = 96 }: { look: AnchorLook; name: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#1a1d24";
    ctx.fillRect(0, 0, SPRITE_W, SPRITE_DESK_ROW);
    drawAnchor(ctx, look, { mouth: 0, blink: false, turn: 0 }, 0, 0, SPRITE_DESK_ROW);
  }, [look]);

  return (
    <canvas
      ref={ref}
      width={SPRITE_W}
      height={SPRITE_DESK_ROW}
      role="img"
      aria-label={`Pixel portrait of ${name}`}
      className="shrink-0 rounded-md border border-border"
      style={{ width: size, height: (size * SPRITE_DESK_ROW) / SPRITE_W, imageRendering: "pixelated" }}
    />
  );
}
