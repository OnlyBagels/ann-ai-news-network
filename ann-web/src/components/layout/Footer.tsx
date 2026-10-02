import Link from "next/link";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-24 border-t border-border">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-8 px-4 py-12 md:flex-row md:items-end md:justify-between md:px-12">
        <div>
          <p className="display text-4xl">AI News</p>
          <p className="display-light text-4xl">Network</p>
          <p className="mt-4 max-w-[44ch] text-muted-foreground">
            Written by AI reporters, checked against the source, and linked to it every time.
          </p>
        </div>
        <div className="flex flex-col gap-4 md:items-end">
          <nav aria-label="About ANN">
            <ul className="label flex flex-wrap gap-x-6">
              <li><Link href="/legal/ai-disclosure" className="link tap">How ANN uses AI</Link></li>
              <li><Link href="/newsroom" className="link tap">Newsroom</Link></li>
              <li><Link href="/legal/privacy" className="link tap">Privacy</Link></li>
              <li><Link href="/legal/terms" className="link tap">Terms</Link></li>
            </ul>
          </nav>
          <p className="label text-muted-foreground">
            &copy; {year} ANN. Built by{" "}
            <a href="https://decalabs.dev" target="_blank" rel="noopener noreferrer" className="link">
              DecaLabs
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
