export interface Article {
  id: string;
  title: string;
  slug: string;
  url: string;
  source: string;
  sourceUrl?: string;
  author?: string;
  publishedAt: string;
  summary: string;
  tlDr?: string;
  content?: string;
  tags: string[];
  category: Category;
  scores: Scores;
  imageUrl?: string;
  relatedArticles?: string[];
  byline?: Byline;
  sources?: ArticleSource[];
}

// The AI reporter who wrote the story, from the newsroom lineup.
export interface Byline {
  id: string;
  name: string;
  title: string;
}

export interface Scores {
  signalScore: number;
  hypeScore: number;
  builderScore: number;
  securityScore: number;
  openSourceScore: number;
  enterpriseScore: number;
  overallScore: number;
}

export type Category =
  | "models"
  | "open-source"
  | "coding-ai"
  | "agents"
  | "research"
  | "security"
  | "funding"
  | "regulation"
  | "world"
  | "us"
  | "politics"
  | "business"
  | "crypto"
  | "tech"
  | "science"
  | "climate"
  | "health"
  | "sports"
  | "entertainment"
  | "gaming"
  | "internet";

export interface CategoryInfo {
  id: Category;
  label: string;
  description: string;
}

// Every category a story can have. The AI beats are grouped into one
// section (see SECTIONS); the rest are sections of their own.
export const CATEGORIES: CategoryInfo[] = [
  { id: "world", label: "World", description: "Conflicts, diplomacy, elections and disasters outside the US" },
  { id: "us", label: "U.S.", description: "Courts, states and cities, crime, disasters, immigration and schools across the US" },
  { id: "politics", label: "Politics", description: "Congress, the White House, campaigns and governments, reported without taking sides" },
  { id: "business", label: "Business", description: "Companies, earnings, jobs, trade and the economy" },
  { id: "crypto", label: "Crypto", description: "Crypto, tokens, NFTs and collectibles markets. Nothing here is financial advice" },
  { id: "tech", label: "Tech", description: "Consumer tech, platforms, gadgets and the companies behind them" },
  { id: "models", label: "AI models", description: "Model launches, API and pricing changes, and benchmark results from the labs" },
  { id: "open-source", label: "Open source AI", description: "Released weights, repos and the licenses that come with them" },
  { id: "coding-ai", label: "AI coding", description: "Coding assistants, IDE tools and what changes for developers" },
  { id: "agents", label: "AI agents", description: "Agent frameworks, protocols like MCP, and agents running in production" },
  { id: "research", label: "AI research", description: "Papers and preprints, with the method separated from the headline number" },
  { id: "security", label: "AI security", description: "Vulnerabilities, jailbreaks, prompt injection and incidents in AI systems" },
  { id: "funding", label: "AI business", description: "Rounds, acquisitions and compute deals in AI" },
  { id: "regulation", label: "AI policy", description: "AI law and policy: what is proposed, what is binding, and when" },
  { id: "science", label: "Science", description: "Research findings, space missions and discoveries" },
  { id: "climate", label: "Climate", description: "Weather extremes, emissions, energy and the environment" },
  { id: "health", label: "Health", description: "Medicine, public health and health policy. Nothing here is medical advice" },
  { id: "sports", label: "Sports", description: "Results, players, teams and leagues" },
  { id: "entertainment", label: "Entertainment", description: "Film, TV, music and the business of entertainment" },
  { id: "gaming", label: "Games", description: "Video games, studios, platforms and the game industry" },
  { id: "internet", label: "Internet", description: "Online trends, creators and platforms, and what people are talking about" },
];

export const AI_CATEGORIES: Category[] = ["models", "open-source", "coding-ai", "agents", "research", "security", "funding", "regulation"];

export interface SectionInfo {
  id: string;
  label: string;
  description: string;
  categories: Category[];
}

// The site's sections, in navigation order.
export const SECTIONS: SectionInfo[] = [
  ...(["world", "us", "politics", "business", "crypto", "tech"] as Category[]).map(sectionFromCategory),
  { id: "ai", label: "AI", description: "Models, open source, coding tools, agents, research, security, business and policy in AI", categories: AI_CATEGORIES },
  ...(["science", "climate", "health", "sports", "entertainment", "gaming", "internet"] as Category[]).map(sectionFromCategory),
];

function sectionFromCategory(id: Category): SectionInfo {
  const c = CATEGORIES.find((x) => x.id === id)!;
  return { id, label: c.label, description: c.description, categories: [id] };
}

export function sectionOf(category: Category): SectionInfo | undefined {
  return SECTIONS.find((s) => s.categories.includes(category));
}

export interface ArticleSource {
  name: string;
  url: string;
  title?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  lean?: string | null;
}

export interface FeedQuery {
  category?: Category;
  search?: string;
  sort?: "signal" | "newest" | "trending";
  page?: number;
  limit?: number;
}

export interface FeedResponse {
  articles: Article[];
  total: number;
  page: number;
  totalPages: number;
}
