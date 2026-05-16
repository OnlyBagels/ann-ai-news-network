"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { CATEGORIES } from "@/types";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex flex-col w-48 border-r border-border bg-terminal-bg/50 shrink-0">
      <div className="px-3 py-2.5 border-b border-border">
        <h3 className="text-[10px] font-mono font-semibold text-muted uppercase tracking-wider">
          Categories
        </h3>
      </div>
      <nav className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        <SidebarLink
          href="/"
          label="Featured"
          isActive={pathname === "/"}
        />
        <SidebarLink
          href="/feed"
          label="All Signals"
          isActive={pathname === "/feed"}
        />
        <div className="px-3 pt-3 pb-1">
          <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">Categories</span>
        </div>
        {CATEGORIES.map((category) => (
          <SidebarLink
            key={category.id}
            href={`/categories/${category.id}`}
            label={category.label}
            color={category.color}
            isActive={pathname === `/categories/${category.id}`}
          />
        ))}
      </nav>
      <div className="px-3 py-2.5 border-t border-border">
        <div className="text-[11px] font-mono text-muted space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="status-dot live" />
            <span>System Online</span>
          </div>
          <div className="text-[9px] text-muted/50">
            v0.1.0 · MVP Build
          </div>
        </div>
      </div>
    </aside>
  );
}

function SidebarLink({
  href,
  label,
  color,
  isActive,
}: {
  href: string;
  label: string;
  color?: string;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 px-3 py-2 text-sm font-mono rounded-md transition-all",
        isActive
          ? "bg-terminal-hover text-accent-cyan"
          : "text-muted hover:text-foreground hover:bg-terminal-hover"
      )}
    >
      {color && (
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full shrink-0",
            color.replace("text-", "bg-")
          )}
        />
      )}
      <span>{label}</span>
      {isActive && (
          <span className="ml-auto text-accent-cyan text-[10px]">{">"}</span>
      )}
    </Link>
  );
}
