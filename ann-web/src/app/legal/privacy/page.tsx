import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "ANN Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-xl font-mono font-bold text-foreground mb-6">
        Privacy Policy
      </h1>
      <div className="prose prose-invert prose-sm max-w-none space-y-4 text-muted font-mono">
        <p>
          ANN ("AI News Network") is committed to protecting your privacy.
          This policy outlines how we collect, use, and safeguard your information.
        </p>

        <h2 className="text-foreground font-semibold text-sm">Information We Collect</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Email address (if you subscribe to our newsletter)</li>
          <li>Basic usage analytics (page views, clicks)</li>
          <li>Search queries (to improve our results)</li>
        </ul>

        <h2 className="text-foreground font-semibold text-sm">How We Use Your Information</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Deliver our newsletter and updates</li>
          <li>Improve our content and user experience</li>
          <li>Monitor platform performance and reliability</li>
        </ul>

        <h2 className="text-foreground font-semibold text-sm">Data Protection</h2>
        <p>
          We implement industry-standard security measures to protect your data.
          We do not sell your personal information to third parties.
        </p>

        <h2 className="text-foreground font-semibold text-sm">Contact</h2>
        <p>
          For privacy-related inquiries, please contact our team.
        </p>

        <p className="text-xs text-muted/60 pt-4">
          Last updated: May 2026
        </p>
      </div>
    </div>
  );
}
