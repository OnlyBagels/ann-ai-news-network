/**
 * Newsroom personas.
 *
 * Each beat has a named reporter; each editorial role has a named editor.
 * Avatars come from DiceBear's `personas` style — deterministic from a
 * seed string, no API key, served straight from their CDN as SVG.
 *
 * The agents themselves don't know about these names — the pipeline assigns
 * a story to a Python agent class (e.g. ModelReporter) and the frontend
 * resolves that to "Maya Chen" at render time via the article's category.
 * Keeps the schema thin and lets us rename personas without touching the
 * agent code or running a migration.
 */

export interface Persona {
  slug: string;
  name: string;
  role: string; // e.g. "Models Reporter", "Editor-in-Chief"
  bio: string;
  avatarUrl: string;
}

const dicebear = (seed: string) =>
  `https://api.dicebear.com/9.x/personas/svg?seed=${encodeURIComponent(seed)}`;

// One reporter per beat. Names are deliberately diverse and human-sounding;
// the AI disclosure lives in the footer per CLAUDE.md, not in the byline.
export const REPORTERS: Record<string, Persona> = {
  models: {
    slug: "maya-chen",
    name: "Maya Chen",
    role: "Models Correspondent",
    bio: "Covers AI model launches, benchmarks, and the labs building them.",
    avatarUrl: dicebear("maya-chen"),
  },
  open_source: {
    slug: "devon-park",
    name: "Devon Park",
    role: "Open Source Reporter",
    bio: "Tracks open-weight models, repos, and developer ecosystems.",
    avatarUrl: dicebear("devon-park"),
  },
  coding_ai: {
    slug: "lucas-faro",
    name: "Lucas Faro",
    role: "Coding AI Reporter",
    bio: "Reports on AI coding tools, IDEs, and developer workflows.",
    avatarUrl: dicebear("lucas-faro"),
  },
  agents: {
    slug: "riya-iyer",
    name: "Riya Iyer",
    role: "Agents Correspondent",
    bio: "Covers agent frameworks, orchestration, and agent-native infrastructure.",
    avatarUrl: dicebear("riya-iyer"),
  },
  research: {
    slug: "elena-rios",
    name: "Dr. Elena Rios",
    role: "Research Correspondent",
    bio: "Covers AI research papers, benchmarks, conferences, and theory.",
    avatarUrl: dicebear("elena-rios"),
  },
  security: {
    slug: "sasha-petrov",
    name: "Sasha Petrov",
    role: "Security Reporter",
    bio: "Covers AI vulnerabilities, jailbreaks, prompt injection, and supply-chain risk.",
    avatarUrl: dicebear("sasha-petrov"),
  },
  regulation: {
    slug: "marcus-hale",
    name: "Marcus Hale",
    role: "Policy Reporter",
    bio: "Reports on AI regulation, lawsuits, and government policy.",
    avatarUrl: dicebear("marcus-hale"),
  },
  funding: {
    slug: "priya-vellore",
    name: "Priya Vellore",
    role: "Business Reporter",
    bio: "Covers AI funding, acquisitions, and market moves.",
    avatarUrl: dicebear("priya-vellore"),
  },
};

export const EDITOR_IN_CHIEF: Persona = {
  slug: "alex-morgan",
  name: "Alex Morgan",
  role: "Editor-in-Chief",
  bio: "Final editorial review; signs off every story before publish.",
  avatarUrl: dicebear("alex-morgan"),
};

export const FACT_CHECKER: Persona = {
  slug: "naomi-okafor",
  name: "Naomi Okafor",
  role: "Fact-Checker",
  bio: "Verifies claims, numbers, attributions, and sources.",
  avatarUrl: dicebear("naomi-okafor"),
};

export const COPY_EDITOR: Persona = {
  slug: "jordan-wei",
  name: "Jordan Wei",
  role: "Copy Editor",
  bio: "Style, clarity, and the anti-slop pass.",
  avatarUrl: dicebear("jordan-wei"),
};

/** Resolve a category string into the reporter assigned to that beat. */
export function reporterForCategory(category: string | null | undefined): Persona {
  if (category && REPORTERS[category]) return REPORTERS[category];
  // Fallback — unknown category gets routed to the models desk by default,
  // matches the agent-side fallback in editorial/triage_editor.py.
  return REPORTERS.models;
}

/**
 * The byline strip — who's credited on this article in what order.
 * Writer first, then editor, then fact-checker. Mirrors a real newsroom
 * masthead: reporter writes, EIC signs off, fact-checker verifies.
 */
export function bylineFor(category: string | null | undefined): {
  writer: Persona;
  editor: Persona;
  factChecker: Persona;
} {
  return {
    writer: reporterForCategory(category),
    editor: EDITOR_IN_CHIEF,
    factChecker: FACT_CHECKER,
  };
}
