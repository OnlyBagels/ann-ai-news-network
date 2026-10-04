import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Providers } from "@/components/providers/Providers";

const DESCRIPTION =
  "The day's news from everywhere, written by AI reporters from the outlets that reported it, every source cited and checked. With a 24-hour live desk.";

export const metadata: Metadata = {
  title: {
    default: "ANN, the AI News Network",
    template: "%s | ANN",
  },
  description: DESCRIPTION,
  openGraph: {
    title: "ANN, the AI News Network",
    description: DESCRIPTION,
    siteName: "ANN",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col">
        <Providers>
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:bg-paper focus:p-4 focus:text-ink">
            Skip to the news
          </a>
          <Header />
          <main id="main" className="mx-auto w-full max-w-[1280px] flex-1 px-4 pt-12 md:px-12 md:pt-16">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
