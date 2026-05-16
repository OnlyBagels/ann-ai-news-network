import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Usage Disclosure",
  description: "How ANN uses AI in its workflows",
};

export default function AIDisclosurePage() {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-xl font-mono font-bold text-foreground mb-6">
        AI Usage Disclosure
      </h1>
      <div className="prose prose-invert prose-sm max-w-none space-y-4 text-muted font-mono">
        <p>
          ANN uses artificial intelligence throughout our newsroom workflow. We
          believe in transparency about how and where AI is used.
        </p>

        <h2 className="text-foreground font-semibold text-sm">Where We Use AI</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Article summarization and TL;DR generation</li>
          <li>Content categorization and tagging</li>
          <li>Signal scoring and ranking</li>
          <li>Deduplication and clustering of related stories</li>
          <li>Trend detection and analysis</li>
        </ul>

        <h2 className="text-foreground font-semibold text-sm">Editorial Oversight</h2>
        <p>
          All AI-generated content is reviewed by human editors before publication.
          AI assists our workflow but does not make final editorial decisions.
        </p>

        <h2 className="text-foreground font-semibold text-sm">Model Transparency</h2>
        <p>
          We use a tiered LLM routing system:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>DeepSeek V4 Flash: High-volume tagging and extraction</li>
          <li>Gemini Flash: Long-context clustering and analysis</li>
          <li>Claude / GPT: Premium editorial content</li>
        </ul>

        <h2 className="text-foreground font-semibold text-sm">Attribution</h2>
        <p>
          We clearly mark AI-generated summaries and analysis. Source articles
          are always linked and attributed to their original authors.
        </p>

        <p className="text-xs text-muted/60 pt-4">
          Last updated: May 2026
        </p>
      </div>
    </div>
  );
}
