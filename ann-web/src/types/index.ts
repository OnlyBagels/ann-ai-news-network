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
  section?: Section;
  region?: Region;
  country?: Country;
  subCategory?: string;
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

export type Section =
  | "world"
  | "politics"
  | "business"
  | "tech"
  | "science"
  | "climate"
  | "health"
  | "sports"
  | "culture"
  | "opinion";

export interface SectionInfo {
  id: Section;
  label: string;
  description: string;
  color: string;
}

export const SECTIONS: SectionInfo[] = [
  {
    id: "world",
    label: "World",
    description: "International news and global affairs",
    color: "text-sky-400",
  },
  {
    id: "politics",
    label: "Politics",
    description: "Policy, legislation, elections, and governance",
    color: "text-orange-400",
  },
  {
    id: "business",
    label: "Business",
    description: "Markets, companies, funding, and economy",
    color: "text-yellow-400",
  },
  {
    id: "tech",
    label: "Tech",
    description: "Technology, AI, software, and hardware",
    color: "text-cyan-400",
  },
  {
    id: "science",
    label: "Science",
    description: "Research, breakthroughs, and academia",
    color: "text-pink-400",
  },
  {
    id: "climate",
    label: "Climate",
    description: "Environment, energy, and climate change",
    color: "text-emerald-400",
  },
  {
    id: "health",
    label: "Health",
    description: "Medicine, public health, and wellness",
    color: "text-rose-400",
  },
  {
    id: "sports",
    label: "Sports",
    description: "Games, leagues, athletes, and competitions",
    color: "text-lime-400",
  },
  {
    id: "culture",
    label: "Culture",
    description: "Arts, media, entertainment, and society",
    color: "text-violet-400",
  },
  {
    id: "opinion",
    label: "Opinion",
    description: "Editorials, analysis, and commentary",
    color: "text-amber-400",
  },
];

export type Region =
  | "us"
  | "eu"
  | "uk"
  | "asia"
  | "africa"
  | "me"
  | "latam"
  | "oceania"
  | "global"
  | "ru"
  | "ua"
  | "cn"
  | "jp";

export interface RegionInfo {
  id: Region;
  label: string;
}

export const REGIONS: RegionInfo[] = [
  { id: "us", label: "US" },
  { id: "eu", label: "EU" },
  { id: "uk", label: "UK" },
  { id: "asia", label: "Asia" },
  { id: "africa", label: "Africa" },
  { id: "me", label: "Middle East" },
  { id: "latam", label: "Latin America" },
  { id: "oceania", label: "Oceania" },
  { id: "global", label: "Global" },
  { id: "ru", label: "Russia" },
  { id: "ua", label: "Ukraine" },
  { id: "cn", label: "China" },
  { id: "jp", label: "Japan" },
];

export type Country = string;

export interface CountryInfo {
  id: Country;
  label: string;
}

export const COUNTRIES: CountryInfo[] = [
  { id: "us", label: "United States" },
  { id: "ca", label: "Canada" },
  { id: "mx", label: "Mexico" },
  { id: "br", label: "Brazil" },
  { id: "ar", label: "Argentina" },
  { id: "co", label: "Colombia" },
  { id: "gb", label: "United Kingdom" },
  { id: "fr", label: "France" },
  { id: "de", label: "Germany" },
  { id: "es", label: "Spain" },
  { id: "it", label: "Italy" },
  { id: "in", label: "India" },
  { id: "cn", label: "China" },
  { id: "jp", label: "Japan" },
  { id: "kr", label: "South Korea" },
  { id: "au", label: "Australia" },
  { id: "nz", label: "New Zealand" },
  { id: "za", label: "South Africa" },
  { id: "ng", label: "Nigeria" },
  { id: "eg", label: "Egypt" },
];

export type GeoFilter =
  | "north-america"
  | "america"
  | "americas"
  | "europe"
  | "asia"
  | "africa"
  | "middle-east"
  | "oceania";

export interface GeoFilterInfo {
  id: GeoFilter;
  label: string;
}

export const GEO_FILTERS: GeoFilterInfo[] = [
  { id: "north-america", label: "North America" },
  { id: "america", label: "America (US)" },
  { id: "americas", label: "Americas" },
  { id: "europe", label: "Europe" },
  { id: "asia", label: "Asia" },
  { id: "africa", label: "Africa" },
  { id: "middle-east", label: "Middle East" },
  { id: "oceania", label: "Oceania" },
];

export interface FeedQuery {
  category?: Category;
  section?: Section;
  region?: Region;
  country?: Country;
  geo?: GeoFilter;
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
