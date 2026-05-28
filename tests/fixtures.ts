import type { Post } from "../src/providers/types.ts";

export function makePost(over: Partial<Post> & { id: string; text: string }): Post {
  return {
    id: over.id,
    url: over.url ?? `https://x.com/${over.author?.handle ?? "i"}/status/${over.id}`,
    text: over.text,
    createdAt: over.createdAt,
    lang: over.lang ?? "en",
    author: over.author ?? { handle: "anon", followers: 1000 },
    metrics: {
      likes: 0,
      retweets: 0,
      replies: 0,
      quotes: 0,
      ...over.metrics,
    },
    isRetweet: over.isRetweet ?? false,
    isReply: over.isReply ?? false,
    hasUrl: over.hasUrl ?? false,
    source: over.source ?? "official",
    matchedQueries: over.matchedQueries,
    score: over.score,
    sentiment: over.sentiment,
  };
}

export const NOW = Date.parse("2026-05-28T12:00:00Z");
export const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
