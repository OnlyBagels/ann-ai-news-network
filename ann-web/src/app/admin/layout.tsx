"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardCheck,
  Activity,
  Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "./actions";

const adminNavItems = [
  {
    href: "/admin",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    href: "/admin/review",
    label: "Review queue",
    icon: ClipboardCheck,
  },
  {
    href: "/admin/agents",
    label: "Agent logs",
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

  // The sign-in page sits outside the admin chrome.
  if (pathname === "/admin/login") return <>{children}</>;

  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-col gap-6 border-b border-rule-strong pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="label-caps text-muted-foreground">Editors only</p>
          <h1 className="display mt-2 text-4xl">Admin</h1>
        </div>
        <form action={signOut}>
          <button type="submit" className="button-quiet">
            Sign out
          </button>
        </form>
      </header>
      <nav aria-label="Admin" className="-mt-12 border-b border-border">
        <ul className="scrollbar-none flex gap-8 overflow-x-auto">
          {adminNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            return (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-12 items-center gap-2 border-b-2 transition-colors duration-[180ms]",
                    isActive ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
