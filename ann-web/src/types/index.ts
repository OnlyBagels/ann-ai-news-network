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
  | "regulation";

export interface CategoryInfo {
  id: Category;
  label: string;
  description: string;
}

export const CATEGORIES: CategoryInfo[] = [
  {
    id: "models",
    label: "Models",
    description: "Model launches, API and pricing changes, and benchmark results from the labs",
  },
  {
    id: "open-source",
    label: "Open source",
    description: "Released weights, repos and the licenses that come with them",
  },
  {
    id: "coding-ai",
    label: "Coding AI",
    description: "Coding assistants, IDE tools and what changes for developers",
  },
  {
    id: "agents",
    label: "Agents",
    description: "Agent frameworks, protocols like MCP, and agents running in production",
  },
  {
    id: "research",
    label: "Research",
    description: "Papers and preprints, with the method separated from the headline number",
  },
  {
    id: "security",
    label: "Security",
    description: "Vulnerabilities, jailbreaks, prompt injection and incidents in AI systems",
  },
  {
    id: "funding",
    label: "Funding",
    description: "Rounds, acquisitions and compute deals",
  },
  {
    id: "regulation",
    label: "Regulation",
    description: "AI law and policy: what is proposed, what is binding, and when",
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
