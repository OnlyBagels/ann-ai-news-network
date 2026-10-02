"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SECTIONS } from "@/types";
import { Mark } from "@/components/layout/Mark";

const PAGES = [
  { href: "/feed", label: "Latest" },
  { href: "/live", label: "Live" },
  { href: "/weather", label: "Weather" },
  { href: "/newsroom", label: "Newsroom" },
  { href: "/ask", label: "Ask the desk" },
  { href: "/search", label: "Search" },
];

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto max-w-[1280px] px-4 md:px-12">
        <div className="flex h-16 items-center justify-between gap-4 md:h-24">
          <Link href="/" className="flex items-center gap-3" onClick={() => setOpen(false)}>
            <Mark size={32} />
            <span className="flex flex-col">
              <span className="display text-2xl">ANN</span>
              <span className="label-caps text-muted-foreground">AI News Network</span>
            </span>
          </Link>

          <nav aria-label="Pages" className="hidden md:block">
            <ul className="flex items-center gap-8">
              {PAGES.map((page) => (
                <li key={page.href}>
                  <Link
                    href={page.href}
                    aria-current={isActive(page.href) ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-2 transition-colors duration-[180ms]",
                      isActive(page.href) ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {page.href === "/search" && <Search className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
                    {page.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <button
            type="button"
            className="inline-flex h-12 w-12 items-center justify-center md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? (
              <X className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <Menu className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
            )}
          </button>
        </div>

        <nav aria-label="Sections" className="border-t border-border">
          <ul className="scrollbar-none -mx-4 flex gap-6 overflow-x-auto px-4 md:mx-0 md:px-0">
            {SECTIONS.map((c) => {
              const href = `/categories/${c.id}`;
              const active = pathname === href;
              return (
                <li key={c.id} className="shrink-0">
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "label inline-flex min-h-11 items-center border-b-2 transition-colors duration-[180ms]",
                      active
                        ? "border-brand text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {c.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      {open && (
        <nav id="site-menu" aria-label="Pages" className="border-t border-border md:hidden">
          <ul className="px-4 py-2">
            {PAGES.map((page) => (
              <li key={page.href} className="border-b border-border last:border-b-0">
                <Link
                  href={page.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive(page.href) ? "page" : undefined}
                  className="display flex min-h-12 items-center text-2xl"
                >
                  {page.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
