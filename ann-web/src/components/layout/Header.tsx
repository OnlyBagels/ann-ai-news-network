"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, Search, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { SearchBar } from "@/components/shared/SearchBar";

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-terminal-header/95 backdrop-blur-sm">
      <div className="flex items-center justify-between h-12 px-4 md:px-6">
        {/* Left: Logo */}
        <div className="flex items-center gap-3">
          <button
            className="md:hidden p-1.5 rounded-md hover:bg-terminal-hover transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            <Menu className="w-4 h-4 text-muted" />
          </button>
          <Link href="/" className="flex items-center gap-2 group">
            <Terminal className="w-4 h-4 text-accent-cyan group-hover:text-accent-green transition-colors" />
            <span className="font-mono text-xs font-bold tracking-tight">
              <span className="text-accent-cyan">ANN</span>
              <span className="text-muted mx-1">/</span>
              <span className="text-foreground">AI News Network</span>
            </span>
          </Link>
        </div>

        {/* Center: Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1">
          <NavLink href="/" label="Feed" />
          <NavLink href="/categories/models" label="Models" />
          <NavLink href="/categories/research" label="Research" />
          <NavLink href="/categories/security" label="Security" />
          <NavLink href="/categories/funding" label="Funding" />
        </nav>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSearchOpen(!searchOpen)}
            className="p-1.5 rounded-md hover:bg-terminal-hover transition-colors"
            aria-label="Search"
          >
            <Search className="w-4 h-4 text-muted hover:text-foreground transition-colors" />
          </button>
          <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono text-muted border border-border rounded px-2 py-1">
            <span className="status-dot live" />
            <span>LIVE</span>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-terminal-bg p-4">
          <nav className="flex flex-col gap-2">
            <MobileNavLink href="/" label="Feed" />
            <MobileNavLink href="/categories/models" label="Models" />
            <MobileNavLink href="/categories/research" label="Research" />
            <MobileNavLink href="/categories/security" label="Security" />
            <MobileNavLink href="/categories/funding" label="Funding" />
            <MobileNavLink href="/categories/open-source" label="Open Source" />
            <MobileNavLink href="/categories/agents" label="Agents" />
            <MobileNavLink href="/categories/coding-ai" label="Coding AI" />
            <MobileNavLink href="/categories/regulation" label="Regulation" />
          </nav>
        </div>
      )}

      {/* Search Overlay */}
      {searchOpen && (
        <div className="border-t border-border bg-terminal-bg p-4">
          <SearchBar onClose={() => setSearchOpen(false)} autoFocus />
        </div>
      )}
    </header>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 text-sm font-mono text-muted hover:text-accent-cyan hover:bg-terminal-hover rounded-md transition-all"
    >
      {label}
    </Link>
  );
}

function MobileNavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="px-3 py-2 text-sm font-mono text-muted hover:text-accent-cyan hover:bg-terminal-hover rounded-md transition-all"
    >
      {label}
    </Link>
  );
}
