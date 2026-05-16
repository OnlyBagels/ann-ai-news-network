import { Redis } from "@upstash/redis";

const redisUrl = process.env.REDIS_URL || "";
const redisToken = process.env.REDIS_TOKEN || "";

export const redis = redisUrl
  ? new Redis({
      url: redisUrl,
      token: redisToken,
    })
  : null;

export const CACHE_TTL = {
  FEED: 60, // 1 minute
  ARTICLE: 300, // 5 minutes
  CATEGORIES: 120, // 2 minutes
  SEARCH: 60, // 1 minute
};

export function getCacheKey(prefix: string, ...parts: (string | undefined)[]): string {
  return `ann:${prefix}:${parts.filter(Boolean).join(":")}`;
}
