import type { Post } from "../providers/types.ts";

// Merge results from multiple queries. Dedup by post id, union the
// matchedQueries, and (matching the X API's 24h-UTC dedup billing window)
// keep a single copy. Returns posts annotated with which queries surfaced them.
export function dedupPosts(
  batches: Array<{ query: string; posts: Post[] }>,
): Post[] {
  const byId = new Map<string, Post>();
  for (const { query, posts } of batches) {
    for (const p of posts) {
      const existing = byId.get(p.id);
      if (existing) {
        existing.matchedQueries = unique([...(existing.matchedQueries ?? []), query]);
      } else {
        byId.set(p.id, { ...p, matchedQueries: [query] });
      }
    }
  }
  return [...byId.values()];
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

// True if two reads of the same post id fall in the same UTC calendar day
// (the API's dedup boundary). Useful for cost reasoning/tests.
export function sameUtcDay(aIso: string, bIso: string): boolean {
  return aIso.slice(0, 10) === bIso.slice(0, 10);
}
