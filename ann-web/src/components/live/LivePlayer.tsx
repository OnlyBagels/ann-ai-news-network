"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Captions, CaptionsOff, ExternalLink, Volume2, VolumeX } from "lucide-react";
import { drawFrame, currentLine, easternClock, WIDTH, HEIGHT } from "@/broadcast/scene";
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
          clockLabel: easternClock(nowMs),
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
  const names = Object.fromEntries([...lineup.anchors, ...(lineup.reporters ?? [])].map((a) => [a.id, a.name]));
  const transcript = segment ? segment.lines.slice(0, spokenCount) : [];

  const picture = youtube ? (
    <div className="relative aspect-video w-full overflow-hidden rounded-sm border border-rule-strong bg-ink">
      <iframe
        src={youtube.embedUrl}
        title="ANN Live on YouTube"
        className="absolute inset-0 h-full w-full"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  ) : (
    <div className="overflow-hidden rounded-sm border border-rule-strong bg-ink">
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        className="block h-auto w-full [image-rendering:pixelated]"
        role="img"
        aria-label={segment ? `On air: ${segment.title}` : "ANN station card"}
      />
    </div>
  );

  const onAirLabel = (
    <p className="label flex items-center gap-2">
      {segment ? <span className="live-dot" aria-hidden="true" /> : null}
      <span className={segment ? "text-brand" : "text-muted-foreground"}>{segment ? "On air" : "Off air"}</span>
    </p>
  );

  if (variant === "compact") {
    return (
      <div className="min-w-0">
        {picture}
        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            {onAirLabel}
            <span className="min-w-0">{show && segment ? `${show.name}: ${segment.title}` : "Station break"}</span>
          </div>
          <Link href="/live" className="label link tap text-muted-foreground">
            Schedule and transcript
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        {picture}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {youtube ? (
            <a href={youtube.watchUrl} target="_blank" rel="noopener noreferrer" className="button-quiet">
              Watch on YouTube <ExternalLink className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </a>
          ) : (
            <button type="button" onClick={toggleCaptions} aria-pressed={captions} className="button-quiet">
              {captions ? (
                <Captions className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <CaptionsOff className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              )}
              Captions {captions ? "on" : "off"}
            </button>
          )}
          {!youtube && hasAudio && (
            <button type="button" onClick={toggleSound} aria-pressed={sound} className="button-quiet">
              {sound ? (
                <Volume2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <VolumeX className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              )}
              Sound {sound ? "on" : "off"}
            </button>
          )}
          {offline && <span className="label text-warn">Can&rsquo;t reach the broadcast right now. Retrying.</span>}
        </div>

        <section aria-labelledby="transcript-title" className="mt-12">
          <h2 id="transcript-title" className="label-caps border-b border-rule-strong pb-2 text-muted-foreground">
            Transcript
          </h2>
          {transcript.length === 0 ? (
            <p className="mt-4 text-muted-foreground">
              {segment ? "The segment is starting." : "Between stories. The next one is on its way."}
            </p>
          ) : (
            <ol className="mt-2" aria-live="off">
              {transcript.map((line, i) => (
                <li key={i} className="grid gap-1 border-b border-border py-3 md:grid-cols-[128px_minmax(0,1fr)] md:gap-6">
                  <span className="label text-muted-foreground">{names[line.speaker] ?? line.speaker}</span>
                  <span>{line.text}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <aside className="flex min-w-0 flex-col gap-12">
        <section aria-labelledby="onair-title">
          {onAirLabel}
          <h2 id="onair-title" className="display mt-2 text-2xl">
            {show ? show.name : "Station break"}
          </h2>
          {show && <p className="mt-2 text-muted-foreground">{show.blurb}</p>}
          {segment?.articles.map((article) => (
            <div key={article.id} className="mt-4 border-t border-border pt-4">
              <p className="font-semibold leading-snug">{article.title}</p>
              <p className="label mt-1 text-muted-foreground">{article.source}</p>
              <div className="label mt-2 flex flex-wrap gap-x-4 gap-y-1">
                <Link href={`/articles/${article.id}`} className="link">
                  Read the story
                </Link>
                <a href={article.url} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1">
                  Original source <ExternalLink className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                </a>
              </div>
            </div>
          ))}
        </section>

        <section aria-labelledby="next-title">
          <h2 id="next-title" className="label-caps border-b border-rule-strong pb-2 text-muted-foreground">
            Coming up
          </h2>
          {upcoming.length === 0 ? (
            <p className="mt-4 text-muted-foreground">The desk writes a few minutes ahead while people are watching.</p>
          ) : (
            <ol>
              {upcoming.slice(0, 5).map((s) => (
                <li key={s.id} className="border-b border-border py-3 leading-snug">
                  <span className="label block text-muted-foreground">{clock(Date.parse(s.startsAt) + delayMs)}</span>
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
