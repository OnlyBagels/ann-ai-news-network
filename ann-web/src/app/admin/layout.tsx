"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardCheck,
  Activity,
  Radio,
  ArrowLeft,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";

const adminNavItems = [
  {
    href: "/admin",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    href: "/admin/review",
    label: "Review Queue",
    icon: ClipboardCheck,
  },
  {
    href: "/admin/agents",
    label: "Agent Logs",
    icon: Activity,
  },
  {
    href: "/admin/sources",
    label: "Sources",
    icon: Radio,
  },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-[calc(100vh-8rem)]">
      {/* Admin Sidebar */}
      <aside className="hidden md:flex flex-col w-56 border-r border-border bg-terminal-bg/50 shrink-0">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-1">
            <Terminal className="w-4 h-4 text-accent-cyan" />
            <h3 className="text-xs font-mono font-semibold text-accent-cyan uppercase tracking-wider">
              Admin Panel
            </h3>
          </div>
          <p className="text-[10px] font-mono text-muted/60">
            Pipeline Management
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {adminNavItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 text-sm font-mono rounded-md transition-all",
                  isActive
                    ? "bg-terminal-hover text-accent-cyan"
                    : "text-muted hover:text-foreground hover:bg-terminal-hover"
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
                {isActive && (
                  <span className="ml-auto text-accent-cyan text-[10px]">
                    {">"}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs font-mono text-muted hover:text-accent-cyan transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Feed
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 p-4 md:p-6 lg:p-8">{children}</main>
    </div>
  );
}
