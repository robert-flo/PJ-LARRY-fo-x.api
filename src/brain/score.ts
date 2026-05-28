import type { Post } from "../providers/types.ts";
import { contentTokens, jaccard } from "./text.ts";

export interface ScoreOptions {
  context?: string; // project context for relevance weighting
  facetCount?: number; // total portfolio facets (for match-centrality)
  now?: number; // injectable for deterministic tests
}

interface Weights {
  engagement: number;
  recency: number;
  authority: number;
  match: number;
  context: number;
}

function weights(hasContext: boolean): Weights {
  if (hasContext)
    return { engagement: 0.4, recency: 0.2, authority: 0.12, match: 0.13, context: 0.15 };
  // No context: fold its weight into engagement.
  return { engagement: 0.55, recency: 0.2, authority: 0.12, match: 0.13, context: 0 };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function engagement(p: Post): number {
  const m = p.metrics;
  return m.likes + 2 * m.retweets + 1.5 * m.quotes + 0.5 * m.replies;
}

function ageHours(p: Post, now: number): number {
  if (!p.createdAt) return 72; // unknown age → treat as moderately stale
  const t = Date.parse(p.createdAt);
  if (Number.isNaN(t)) return 72;
  return Math.max(0, (now - t) / 3_600_000);
}

// Score a single post 0-100. Deterministic given inputs.
export function scorePost(p: Post, opts: ScoreOptions = {}): number {
  const now = opts.now ?? Date.now();
  const w = weights(!!opts.context);

  const engNorm = clamp01(Math.log10(1 + engagement(p)) / 5); // 100k weighted eng → 1
  const recNorm = clamp01(Math.exp(-ageHours(p, now) / 48)); // 48h half-life-ish
  const authNorm = clamp01(Math.log10(1 + (p.author.followers ?? 0)) / 7); // 10M → 1
  const matchNorm = clamp01(
    (p.matchedQueries?.length ?? 1) / Math.max(1, opts.facetCount ?? 1),
  );
  const ctxNorm = opts.context
    ? jaccard(contentTokens(p.text), contentTokens(opts.context))
    : 0;

  let raw =
    w.engagement * engNorm +
    w.recency * recNorm +
    w.authority * authNorm +
    w.match * matchNorm +
    w.context * ctxNorm;

  if (p.isReply) raw *= 0.9; // replies tend to carry less standalone signal

  return Math.round(raw * 1000) / 10; // 0-100, one decimal
}

// Score every post in place and return them sorted by descending score.
export function scoreAll(posts: Post[], opts: ScoreOptions = {}): Post[] {
  for (const p of posts) p.score = scorePost(p, opts);
  return [...posts].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
