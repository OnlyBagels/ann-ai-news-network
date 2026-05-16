"use client";

import { useState } from "react";
import { Mail, Check, Loader2 } from "lucide-react";

export function NewsletterSignup() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("loading");
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (res.ok) {
        setStatus("success");
        setMessage("Subscribed! Check your inbox.");
        setEmail("");
      } else {
        const data = await res.json();
        setStatus("error");
        setMessage(data.error || "Something went wrong.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  };

  return (
    <div className="border border-border rounded-sm bg-terminal-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Mail className="w-4 h-4 text-accent-cyan" />
        <h3 className="text-xs font-mono font-semibold text-foreground">
          Signal Briefing
        </h3>
      </div>
      <p className="text-[11px] text-muted mb-3 font-mono leading-relaxed">
        Get the day's highest-signal AI intelligence delivered to your inbox.
        No hype. Just signal.
      </p>
      {status === "success" ? (
        <div className="flex items-center gap-2 text-accent-green text-xs font-mono">
          <Check className="w-3.5 h-3.5" />
          <span>{message}</span>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="terminal-input flex-1 text-xs"
          />
          <button
            type="submit"
            disabled={status === "loading"}
            className="px-3 py-1.5 text-xs font-mono bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/30 rounded-sm hover:bg-accent-cyan/20 transition-colors disabled:opacity-50 shrink-0"
          >
            {status === "loading" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              "Subscribe"
            )}
          </button>
        </form>
      )}
      {status === "error" && (
        <p className="mt-1.5 text-[10px] font-mono text-accent-red">{message}</p>
      )}
    </div>
  );
}
