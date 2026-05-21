import Link from "next/link";
import { headers } from "next/headers";
import { SECTIONS } from "@/types";

interface SectionNavProps {
  activeSlug?: string;
}

export async function SectionNav({ activeSlug }: SectionNavProps = {}) {
  // Derive active slug from the request path when not supplied by the caller.
  let active = activeSlug;
  if (!active) {
    const headersList = await headers();
    const pathname = headersList.get("x-pathname") ?? headersList.get("x-invoke-path") ?? "";
    const match = pathname.match(/^\/sections\/([^/]+)/);
    if (match) {
      active = match[1];
    }
  }

  return (
    <nav
      className="sticky top-12 z-40 -mx-4 md:-mx-6 px-4 md:px-6 border-b border-border bg-terminal-header/95 backdrop-blur-sm overflow-x-auto"
      aria-label="Section navigation"
    >
      <ol className="flex items-center gap-0 min-w-max py-0">
        {SECTIONS.map((section, idx) => {
          const isActive = section.id === active;
          return (
            <li key={section.id} className="flex items-center">
              {idx > 0 && (
                <span className="text-border select-none px-1 text-[11px] font-mono">·</span>
              )}
              <Link
                href={`/sections/${section.id}`}
                className={[
                  "px-2 py-2.5 text-[11px] font-mono uppercase tracking-widest whitespace-nowrap transition-colors",
                  "border-b-2 -mb-px",
                  isActive
                    ? `border-accent-cyan text-accent-cyan`
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-foreground/30",
                ].join(" ")}
                aria-current={isActive ? "page" : undefined}
              >
                {section.label}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
