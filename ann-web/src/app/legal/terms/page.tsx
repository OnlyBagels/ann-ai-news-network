import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "ANN Terms of Service",
};

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-xl font-mono font-bold text-foreground mb-6">
        Terms of Service
      </h1>
      <div className="prose prose-invert prose-sm max-w-none space-y-4 text-muted font-mono">
        <p>
          By accessing ANN ("AI News Network"), you agree to these terms.
        </p>

        <h2 className="text-foreground font-semibold text-sm">Use of Service</h2>
        <p>
          ANN provides AI ecosystem intelligence and news aggregation. Content is
          provided for informational purposes only and should not be considered
          financial or professional advice.
        </p>

        <h2 className="text-foreground font-semibold text-sm">Intellectual Property</h2>
        <p>
          Original analysis, summaries, and scoring methodologies are the property
          of ANN. Source articles remain the property of their respective authors
          and publications. We link to and attribute all sources.
        </p>

        <h2 className="text-foreground font-semibold text-sm">Acceptable Use</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Do not scrape or republish our content without permission</li>
          <li>Do not use the service for illegal purposes</li>
          <li>Do not attempt to bypass rate limits or access controls</li>
        </ul>

        <h2 className="text-foreground font-semibold text-sm">Limitation of Liability</h2>
        <p>
          ANN is provided "as is" without warranties. We are not liable for
          damages arising from use of the service.
        </p>

        <p className="text-xs text-muted/60 pt-4">
          Last updated: May 2026
        </p>
      </div>
    </div>
  );
}
