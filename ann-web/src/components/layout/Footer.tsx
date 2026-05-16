import Link from "next/link";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-background mt-auto">
      <div className="px-4 md:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Left: brand + legal links */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
            <span className="text-[11px] font-mono text-muted-foreground">
              © {year} ANN — AI News Network
            </span>
            <nav className="flex items-center gap-4 text-[11px] font-mono">
              <Link
                href="/legal/privacy"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Privacy
              </Link>
              <Link
                href="/legal/terms"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Terms
              </Link>
              <Link
                href="/legal/ai-disclosure"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                AI Disclosure
              </Link>
            </nav>
          </div>

          {/* Right: powered by */}
          <a
            href="https://decalabs.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors group"
          >
            <span>Powered by</span>
            <span className="font-semibold text-foreground group-hover:underline underline-offset-4">
              DecaLabs
            </span>
          </a>
        </div>
      </div>
    </footer>
  );
}
