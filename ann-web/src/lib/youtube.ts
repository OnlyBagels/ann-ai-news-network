// Where the channel airs on YouTube. Read on the server per request, so
// changing these needs a restart, not a rebuild.
//
//   YOUTUBE_CHANNEL_ID      embeds whatever the channel is streaming now
//   YOUTUBE_VIDEO_ID        embeds one specific live video instead
//   YOUTUBE_DELAY_SECONDS   how far YouTube runs behind real time (default 20);
//                           the transcript and "on air" panel wait this long
//                           so they match the picture

export interface YouTubeConfig {
  embedUrl: string;
  watchUrl: string;
  delayMs: number;
}

const ID = /^[A-Za-z0-9_-]{6,64}$/;

export function getYouTubeConfig(): YouTubeConfig | null {
  const video = process.env.YOUTUBE_VIDEO_ID?.trim();
  const channel = process.env.YOUTUBE_CHANNEL_ID?.trim();
  const delay = Number(process.env.YOUTUBE_DELAY_SECONDS ?? 20);
  const delayMs = Number.isFinite(delay) && delay >= 0 ? delay * 1000 : 20_000;
  const params = "autoplay=1&mute=1&playsinline=1&rel=0";

  if (video && ID.test(video)) {
    return {
      embedUrl: `https://www.youtube.com/embed/${video}?${params}`,
      watchUrl: `https://www.youtube.com/watch?v=${video}`,
      delayMs,
    };
  }
  if (channel && ID.test(channel)) {
    return {
      embedUrl: `https://www.youtube.com/embed/live_stream?channel=${channel}&${params}`,
      watchUrl: `https://www.youtube.com/channel/${channel}/live`,
      delayMs,
    };
  }
  return null;
}
