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
  | "open_source"
  | "coding_ai"
  | "agents"
  | "research"
  | "security"
  | "funding"
  | "regulation";

export interface CategoryInfo {
  id: Category;
  label: string;
  description: string;
  color: string;
}

export const CATEGORIES: CategoryInfo[] = [
  {
    id: "models",
    label: "Models",
    description: "New model releases, updates, and benchmarks",
    color: "text-cyan-400",
  },
  {
    id: "open_source",
    label: "Open Source",
    description: "Open-source AI projects, releases, and community",
    color: "text-emerald-400",
  },
  {
    id: "coding_ai",
    label: "Coding AI",
    description: "AI coding tools, IDEs, and developer workflows",
    color: "text-blue-400",
  },
  {
    id: "agents",
    label: "Agents",
    description: "AI agent frameworks, deployments, and research",
    color: "text-violet-400",
  },
  {
    id: "research",
    label: "Research",
    description: "Academic papers, breakthroughs, and preprints",
    color: "text-pink-400",
  },
  {
    id: "security",
    label: "Security",
    description: "AI security, jailbreaks, prompt injection, and risks",
    color: "text-red-400",
  },
  {
    id: "funding",
    label: "Funding",
    description: "AI startup funding, acquisitions, and market moves",
    color: "text-yellow-400",
  },
  {
    id: "regulation",
    label: "Regulation",
    description: "AI policy, regulation, and governance",
    color: "text-orange-400",
  },
];

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
