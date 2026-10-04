"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SearchBar({ initial = "" }: { initial?: string }) {
  const [query, setQuery] = useState(initial);
  const router = useRouter();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <form onSubmit={submit} role="search" className="flex max-w-[720px] flex-col gap-2 sm:flex-row">
      <label htmlFor="search-input" className="sr-only">
        Search stories
      </label>
      <input
        id="search-input"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="For example: Gemini, prompt injection, EU AI Act"
        className="field flex-1"
      />
      <button type="submit" className="button">
        Search
      </button>
    </form>
  );
}
