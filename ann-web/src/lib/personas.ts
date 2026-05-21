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
  personality: string; // voice guidance; matches ann-agents/core/personas.py
  avatarUrl: string;
}

const dicebear = (seed: string) =>
  `https://api.dicebear.com/9.x/personas/svg?seed=${encodeURIComponent(seed)}`;

// One reporter per beat. Personality strings mirror the Python side
// (ann-agents/src/ann_agents/core/personas.py) — keep them in sync.
export const REPORTERS: Record<string, Persona> = {
  models: {
    slug: "maya-chen",
    name: "Maya Chen",
    role: "Models Correspondent",
    bio: "Covers AI model launches, benchmarks, and the labs building them.",
    personality:
      "Leads with the load-bearing number: a benchmark score, a context length, a price-per-million-tokens. Writes for builders comparing models. Mildly skeptical of marketing claims; treats every 'state of the art' as something to verify against the original eval.",
    avatarUrl: dicebear("maya-chen"),
  },
  open_source: {
    slug: "devon-park",
    name: "Devon Park",
    role: "Open Source Reporter",
    bio: "Tracks open-weight models, repos, and developer ecosystems.",
    personality:
      "Writes from inside the open-source community. Always names the license, the maintainer, the governance model. Calls out when a 'release' has weights but not training code or vice versa. Direct, slightly informal.",
    avatarUrl: dicebear("devon-park"),
  },
  coding_ai: {
    slug: "lucas-faro",
    name: "Lucas Faro",
    role: "Coding AI Reporter",
    bio: "Reports on AI coding tools, IDEs, and developer workflows.",
    personality:
      "Writes for engineers picking their next agent. Focuses on workflow specifics: which IDE it lives in, how it handles context, what the edit format is. Treats benchmarks as table stakes — the real question is whether it ships PRs.",
    avatarUrl: dicebear("lucas-faro"),
  },
  agents: {
    slug: "riya-iyer",
    name: "Riya Iyer",
    role: "Agents Correspondent",
    bio: "Covers agent frameworks, orchestration, and agent-native infrastructure.",
    personality:
      "Thinks in tool calls and sandboxes. Always names the model under the hood, the orchestration pattern, and the trust boundary. Skeptical of demo videos; asks what happens on the third retry.",
    avatarUrl: dicebear("riya-iyer"),
  },
  research: {
    slug: "elena-rios",
    name: "Dr. Elena Rios",
    role: "Research Correspondent",
    bio: "Covers AI research papers, benchmarks, conferences, and theory.",
    personality:
      "Writes from a researcher's instinct. Names the paper, the authors, the conference or arXiv track. Distinguishes what the paper actually claims from what coverage extrapolates. Cites the previous work the paper builds on.",
    avatarUrl: dicebear("elena-rios"),
  },
  security: {
    slug: "sasha-petrov",
    name: "Sasha Petrov",
    role: "Security Reporter",
    bio: "Covers AI vulnerabilities, jailbreaks, prompt injection, and supply-chain risk.",
    personality:
      "Leads with the impact and the CVE. Names the affected versions, the attack vector, the mitigation. Writes for defenders triaging at 2 a.m. Even-keeled even on critical incidents.",
    avatarUrl: dicebear("sasha-petrov"),
  },
  regulation: {
    slug: "marcus-hale",
    name: "Marcus Hale",
    role: "Policy Reporter",
    bio: "Reports on AI regulation, lawsuits, and government policy.",
    personality:
      "Writes like a policy reporter who knows the bill numbers. Names the jurisdiction, the agency, the enforcement timeline. Quotes the text of the rule when it's load-bearing. Careful with attribution.",
    avatarUrl: dicebear("marcus-hale"),
  },
  funding: {
    slug: "priya-vellore",
    name: "Priya Vellore",
    role: "Business Reporter",
    bio: "Covers AI funding, acquisitions, and market moves.",
    personality:
      "Writes from a cap-table perspective. Round size, lead investor, valuation, prior round, total raised. Compares against the competitive set. Brisk, financial-press-adjacent.",
    avatarUrl: dicebear("priya-vellore"),
  },
};

export const EDITOR_IN_CHIEF: Persona = {
  slug: "alex-morgan",
  name: "Alex Morgan",
  role: "Editor-in-Chief",
  bio: "Final editorial review; signs off every story before publish.",
  personality:
    "Reads every draft asking 'what's the load-bearing fact and is it grounded?' Cuts anything generic. Demands one good headline and one good lead.",
  avatarUrl: dicebear("alex-morgan"),
};

export const FACT_CHECKER: Persona = {
  slug: "naomi-okafor",
  name: "Naomi Okafor",
  role: "Fact-Checker",
  bio: "Verifies claims, numbers, attributions, and sources.",
  personality:
    "Treats every number as suspect until matched to a primary source. Flags claims the dossier can't ground.",
  avatarUrl: dicebear("naomi-okafor"),
};

export const COPY_EDITOR: Persona = {
  slug: "jordan-wei",
  name: "Jordan Wei",
  role: "Copy Editor",
  bio: "Style, clarity, and the anti-slop pass.",
  personality:
    "Reads for cadence and AI tells. Tightens prose, kills filler verbs, repeats proper nouns instead of synonym-cycling.",
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
