import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { Ticker } from "@/components/layout/Ticker";
import { Footer } from "@/components/layout/Footer";
import { Providers } from "@/components/providers/Providers";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "ANN — AI News Network",
    template: "%s — ANN",
  },
  description:
    "AI ecosystem intelligence for builders, founders, and operators. No hype. Just signal.",
  keywords: [
    "AI news",
    "artificial intelligence",
    "machine learning",
    "LLM",
    "AI ecosystem",
    "AI intelligence",
  ],
  openGraph: {
    title: "ANN — AI News Network",
    description:
      "AI ecosystem intelligence for builders, founders, and operators. No hype. Just signal.",
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
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <Providers>
          <div className="scanlines flex flex-col min-h-screen">
            <Header />
            <Ticker />
            <div className="flex flex-1">
              <Sidebar />
              <main className="flex-1 min-w-0 px-4 py-6 md:px-8 lg:px-12 max-w-5xl mx-auto w-full">
                {children}
              </main>
            </div>
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  );
}
