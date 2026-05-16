"use client";

import { useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";

interface SearchBarProps {
  onClose?: () => void;
  autoFocus?: boolean;
}

export function SearchBar({ onClose, autoFocus }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
      onClose?.();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search articles, models, repos..."
          className="terminal-input w-full pl-10 pr-4"
        />
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-md hover:bg-terminal-hover transition-colors"
          aria-label="Close search"
        >
          <X className="w-4 h-4 text-muted" />
        </button>
      )}
      <button
        type="submit"
        className="px-4 py-2 text-sm font-mono bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/30 rounded-md hover:bg-accent-cyan/20 transition-colors"
      >
        Search
      </button>
    </form>
  );
}
