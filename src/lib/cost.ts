// X API pay-per-use pricing, verified against docs.x.com (2026-05).
// Used for dry-run estimates and budget guards. Cookie provider is $0.

export const PRICING = {
  postRead: 0.005, // general post read (search results, timelines of others)
  ownedRead: 0.001, // your own posts, mentions, bookmarks, followers
  postWrite: 0.015, // creating a post without a URL
  postWriteWithUrl: 0.2, // creating a post WITH a URL (13x penalty)
  monthlyReadCap: 2_000_000,
} as const;

export interface CostEstimate {
  posts: number; // upper-bound post reads
  unitCost: number;
  total: number; // USD
  note: string;
}

// Upper-bound estimate: every query returns up to maxPerQuery posts before dedup.
// Real spend is usually lower (24h-UTC dedup + cross-query overlap collapse it).
export function estimateResearch(
  queries: number,
  maxPerQuery: number,
  unitCost: number,
): CostEstimate {
  const posts = queries * maxPerQuery;
  const total = round(posts * unitCost);
  return {
    posts,
    unitCost,
    total,
    note:
      unitCost === 0
        ? "cookie provider: reads are free"
        : `upper bound before dedup; actual typically 40-70% of this`,
  };
}

export function estimateReads(posts: number, unitCost: number): CostEstimate {
  return {
    posts,
    unitCost,
    total: round(posts * unitCost),
    note: unitCost === 0 ? "cookie provider: reads are free" : "",
  };
}

// Conservative per-read cost for a provider choice, usable without resolving a
// live provider (so dry-run/cost previews work with no credentials).
export function unitCostForChoice(choice: string): number {
  return choice === "cookie" ? 0 : PRICING.postRead;
}

export function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function fmtUsd(n: number): string {
  return n === 0 ? "$0.00 (free)" : `$${n.toFixed(n < 0.01 ? 4 : 2)}`;
}
