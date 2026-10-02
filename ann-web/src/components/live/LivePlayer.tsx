"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Captions, CaptionsOff, ExternalLink, Volume2, VolumeX } from "lucide-react";
import { drawFrame, currentLine, WIDTH, HEIGHT } from "@/broadcast/scene";
import type { LiveNow, Lineup, Segment } from "@/broadcast/types";
import type { YouTubeConfig } from "@/lib/youtube";

const POLL_MS = 10_000;
const CHECKIN_MS = 60_000;

function viewerId(): string {
  const fresh = () => `v-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  try {
    const saved = window.localStorage.getItem("ann-viewer");
    if (saved) return saved;
    const id = fresh();
    window.localStorage.setItem("ann-viewer", id);
    return id;
  } catch {
    return fresh();
  }
}

function onAir(segments: Segment[], nowMs: number) {
  const index = segments.findIndex((s) => {
    const start = Date.parse(s.startsAt);
    return start <= nowMs && nowMs < start + s.durationMs;
  });
  const segment = index >= 0 ? segments[index] : null;
  const upcoming = segments.filter((s) => Date.parse(s.startsAt) > nowMs);
  return { segment, upcoming };
}

interface LivePlayerProps {
  lineup: Lineup;
  // When set, the picture is the YouTube stream and the panels follow it
  // `delayMs` behind real time. Without it, the page draws the channel itself.
  youtube?: YouTubeConfig | null;
  // "full" for /live; "compact" is the picture and one line, for the front page.
  variant?: "full" | "compact";
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

export function LivePlayer({ lineup, youtube = null, variant = "full" }: LivePlayerProps) {
  const delayMs = youtube?.delayMs ?? 0;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<LiveNow | null>(null);
  const offsetRef = useRef(0); // server clock minus this clock
  const captionsRef = useRef(true);
  const soundRef = useRef(false);
  const audioRef = useRef<{ key: string; el: HTMLAudioElement } | null>(null);

  const [captions, setCaptions] = useState(true);
  const [sound, setSound] = useState(false);
  const [segment, setSegment] = useState<Segment | null>(null);
  const [upcoming, setUpcoming] = useState<Segment[]>([]);
  const [spokenCount, setSpokenCount] = useState(0);
  const [offline, setOffline] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);

  const poll = useCallback(async () => {
    const sent = Date.now();
    try {
      const res = await fetch("/api/live/now", { cache: "no-store" });
      const data: LiveNow = await res.json();
      const received = Date.now();
      offsetRef.current = Date.parse(data.serverTime) - (sent + received) / 2;
      liveRef.current = data;
      setHasAudio(data.segments.some((s) => s.lines.some((l) => l.audio)));
      setOffline(!res.ok);
    } catch {
      setOffline(true);
    }
  }, []);

  // Timeline polling.
  useEffect(() => {
    const first = window.setTimeout(poll, 0);
    const timer = window.setInterval(poll, POLL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [poll]);

  // Tell the broadcast someone is watching, while the tab is visible.
  useEffect(() => {
    const id = viewerId();
    const send = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/live/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      }).catch(() => {});
    };
    send();
    const timer = window.setInterval(send, CHECKIN_MS);
    document.addEventListener("visibilitychange", send);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", send);
    };
  }, []);

  // Render loop. With YouTube it only keeps the panels in step with the stream.
  useEffect(() => {
    const ctx = youtube ? null : canvasRef.current?.getContext("2d");
    if (!youtube && !ctx) return;
    let frame = 0;
    let shownId: string | null = null;
    let shownCount = -1;
    let upcomingKey = "";

    const render = () => {
      const nowMs = Date.now() + offsetRef.current - delayMs;
      const segments = liveRef.current?.segments ?? [];
      const { segment: seg, upcoming: next } = onAir(segments, nowMs);
      const elapsed = seg ? nowMs - Date.parse(seg.startsAt) : 0;

      if (ctx) {
        drawFrame(ctx, {
          lineup,
          nowMs,
          segment: seg,
          segmentElapsedMs: elapsed,
          upcoming: next,
          clockLabel: clock(nowMs),
          captions: captionsRef.current,
        });
      }

      const cur = seg ? currentLine(seg, elapsed) : null;
      const count = seg ? seg.lines.filter((l) => l.startMs <= elapsed).length : 0;
      if ((seg?.id ?? null) !== shownId || count !== shownCount) {
        shownId = seg?.id ?? null;
        shownCount = count;
        setSegment(seg);
        setSpokenCount(count);
      }
      const key = next.map((s) => s.id).join(",");
      if (key !== upcomingKey) {
        upcomingKey = key;
        setUpcoming(next);
      }

      // Voice: play the clip for the line on air, started at the right offset.
      const line = cur?.line;
      const audioKey = seg && line?.audio ? `${seg.id}:${cur!.index}` : "";
      if (ctx && soundRef.current && audioKey && audioRef.current?.key !== audioKey) {
        audioRef.current?.el.pause();
        const el = new Audio(`/api/live/audio/${line!.audio}`);
        el.currentTime = Math.max(0, cur!.lineElapsedMs / 1000);
        el.play().catch(() => {});
        audioRef.current = { key: audioKey, el };
      } else if ((!soundRef.current || !audioKey) && audioRef.current) {
        audioRef.current.el.pause();
        audioRef.current = null;
      }

      frame = window.requestAnimationFrame(render);
    };
    frame = window.requestAnimationFrame(render);
    return () => {
      window.cancelAnimationFrame(frame);
      audioRef.current?.el.pause();
    };
  }, [lineup, youtube, delayMs]);

  const toggleCaptions = () => {
    captionsRef.current = !captionsRef.current;
    setCaptions(captionsRef.current);
  };
  const toggleSound = () => {
    soundRef.current = !soundRef.current;
    setSound(soundRef.current);
  };

  const show = segment ? lineup.shows.find((s) => s.id === segment.showId) : null;
  const names = Object.fromEntries(lineup.anchors.map((a) => [a.id, a.name]));
  const transcript = segment ? segment.lines.slice(0, spokenCount) : [];

  const picture = youtube ? (
    <div className="relative w-full aspect-video border border-foreground bg-foreground">
      <iframe
        src={youtube.embedUrl}
        title="ANN Live on YouTube"
        className="absolute inset-0 w-full h-full"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  ) : (
    <div className="border border-foreground bg-foreground">
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        className="block w-full h-auto [image-rendering:pixelated]"
        role="img"
        aria-label={segment ? `On air: ${segment.title}` : "ANN station card"}
      />
    </div>
  );

  if (variant === "compact") {
    return (
      <div className="min-w-0">
        {picture}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mt-2 text-sm">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-widest">On air</span>
          <span className="min-w-0 text-foreground/80">
            {show && segment ? `${show.name}: ${segment.title}` : "Station break"}
          </span>
          <Link href="/live" className="ml-auto text-xs font-mono underline underline-offset-4 hover:text-muted-foreground">
            Transcript and schedule
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0">
        {picture}
        <div className="flex flex-wrap items-center gap-2 mt-2">
          {youtube ? (
            <a
              href={youtube.watchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-mono border border-border rounded-sm hover:border-foreground transition-colors"
            >
              Watch on YouTube <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          ) : (
            <button
              type="button"
              onClick={toggleCaptions}
              aria-pressed={captions}
              className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-mono border border-border rounded-sm hover:border-foreground transition-colors"
            >
              {captions ? <Captions className="w-4 h-4" /> : <CaptionsOff className="w-4 h-4" />}
              Captions {captions ? "on" : "off"}
            </button>
          )}
          {!youtube && hasAudio && (
            <button
              type="button"
              onClick={toggleSound}
              aria-pressed={sound}
              className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-mono border border-border rounded-sm hover:border-foreground transition-colors"
            >
              {sound ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              Sound {sound ? "on" : "off"}
            </button>
          )}
          {offline && (
            <span className="text-xs font-mono text-muted-foreground">
              Can&rsquo;t reach the broadcast right now. Retrying.
            </span>
          )}
        </div>

        <section aria-labelledby="transcript-title" className="mt-6">
          <h2 id="transcript-title" className="text-sm font-semibold mb-2">Transcript</h2>
          {transcript.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {segment ? "The segment is starting." : "Nothing is on the desk right now. The next segment starts as soon as it is written."}
            </p>
          ) : (
            <ol className="space-y-1.5 text-sm" aria-live="off">
              {transcript.map((line, i) => (
                <li key={i} className="leading-relaxed">
                  <span className="font-mono text-xs text-muted-foreground mr-2">{names[line.speaker] ?? line.speaker}</span>
                  {line.text}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <aside className="space-y-6 min-w-0">
        <section aria-labelledby="onair-title">
          <h2 id="onair-title" className="text-sm font-semibold mb-1">
            {show ? show.name : "Station break"}
          </h2>
          {show && <p className="text-sm text-muted-foreground leading-relaxed">{show.blurb}</p>}
          {segment?.articles.map((article) => (
            <div key={article.id} className="mt-3 border-t border-border pt-3">
              <p className="text-sm font-medium leading-snug">{article.title}</p>
              <p className="text-xs font-mono text-muted-foreground mt-1">{article.source}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs font-mono">
                <Link href={`/articles/${article.id}`} className="underline underline-offset-4 hover:text-muted-foreground">
                  Read the ANN brief
                </Link>
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline underline-offset-4 hover:text-muted-foreground"
                >
                  Original source <ExternalLink className="w-3 h-3" aria-hidden="true" />
                </a>
              </div>
            </div>
          ))}
        </section>

        <section aria-labelledby="next-title">
          <h2 id="next-title" className="text-sm font-semibold mb-1">Coming up</h2>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">The desk writes a few minutes ahead while people are watching.</p>
          ) : (
            <ol className="text-sm divide-y divide-border">
              {upcoming.slice(0, 5).map((s) => (
                <li key={s.id} className="py-2 leading-snug">
                  <span className="block font-mono text-[11px] text-muted-foreground">
                    {clock(Date.parse(s.startsAt) + delayMs)}
                  </span>
                  {s.title}
                </li>
              ))}
            </ol>
          )}
        </section>
      </aside>
    </div>
  );
}
