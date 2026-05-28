import type { Post, ProviderName, Sentiment } from "../providers/types.ts";
import type { PortfolioQuery } from "./portfolio.ts";
import type { CostEstimate } from "../lib/cost.ts";
import { classifySentiment, contentTokens, jaccard, STOPWORDS, tokenize } from "./text.ts";

export interface Cluster {
  label: string;
  sentiment: Sentiment;
  size: number;
  topPosts: PostRef[];
}
export interface PostRef {
  id: string;
  url: string;
  handle?: string;
  score?: number;
  text: string;
}
export interface VoiceSummary {
  handle?: string;
  name?: string;
  followers?: number;
  posts: number;
  totalScore: number;
  topPost: { id: string; url: string };
}
export interface ResearchResult {
  intent: string;
  provider: ProviderName;
  queriesRun: Array<{ facet: string; label: string; query: string }>;
  postsConsidered: number;
  cost: CostEstimate;
  signalBreakdown: Record<Sentiment, number>;
  clusters: Cluster[];
  topVoices: VoiceSummary[];
  topPosts: PostRef[];
  rawPosts: Post[];
}

function ref(p: Post): PostRef {
  return { id: p.id, url: p.url, handle: p.author.handle, score: p.score, text: p.text };
}

function clusterLabel(members: Post[]): string {
  const freq = new Map<string, number>();
  for (const p of members) {
    for (const tok of new Set(tokenize(p.text))) {
      if (STOPWORDS.has(tok) || tok.length < 3) continue;
      freq.set(tok, (freq.get(tok) ?? 0) + 1);
    }
  }
  const top = [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 3)
    .map(([t]) => t);
  return top.join(" / ") || "misc";
}

function dominantSentiment(members: Post[]): Sentiment {
  const counts: Record<Sentiment, number> = { pain: 0, win: 0, question: 0, neutral: 0 };
  for (const p of members) counts[p.sentiment ?? "neutral"]++;
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return (sorted[0]?.[0] as Sentiment) ?? "neutral";
}

// Greedy single-link clustering by content-token Jaccard over score-sorted posts.
function cluster(posts: Post[], threshold = 0.18, maxClusters = 5): Cluster[] {
  const tokenSets = new Map<string, Set<string>>();
  for (const p of posts) tokenSets.set(p.id, contentTokens(p.text));
  const used = new Set<string>();
  const clusters: Cluster[] = [];

  for (const seed of posts) {
    if (used.has(seed.id)) continue;
    const members = [seed];
    used.add(seed.id);
    const seedTokens = tokenSets.get(seed.id)!;
    for (const other of posts) {
      if (used.has(other.id)) continue;
      if (jaccard(seedTokens, tokenSets.get(other.id)!) >= threshold) {
        members.push(other);
        used.add(other.id);
      }
    }
    if (members.length >= 2) {
      clusters.push({
        label: clusterLabel(members),
        sentiment: dominantSentiment(members),
        size: members.length,
        topPosts: members.slice(0, 3).map(ref),
      });
    }
    if (clusters.length >= maxClusters) break;
  }
  return clusters;
}

function topVoices(posts: Post[], limit = 6): VoiceSummary[] {
  const byHandle = new Map<string, { v: VoiceSummary; bestScore: number }>();
  for (const p of posts) {
    const key = p.author.handle ?? p.author.id ?? "unknown";
    const cur = byHandle.get(key);
    if (cur) {
      cur.v.posts++;
      cur.v.totalScore = round1(cur.v.totalScore + (p.score ?? 0));
      if ((p.score ?? 0) > cur.bestScore) {
        cur.bestScore = p.score ?? 0;
        cur.v.topPost = { id: p.id, url: p.url };
      }
    } else {
      byHandle.set(key, {
        bestScore: p.score ?? 0,
        v: {
          handle: p.author.handle,
          name: p.author.name,
          followers: p.author.followers,
          posts: 1,
          totalScore: round1(p.score ?? 0),
          topPost: { id: p.id, url: p.url },
        },
      });
    }
  }
  return [...byHandle.values()]
    .map((x) => x.v)
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, limit);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function synthesize(
  intent: string,
  provider: ProviderName,
  queries: PortfolioQuery[],
  scoredPosts: Post[],
  cost: CostEstimate,
): ResearchResult {
  for (const p of scoredPosts) p.sentiment = classifySentiment(p.text);

  const breakdown: Record<Sentiment, number> = { pain: 0, win: 0, question: 0, neutral: 0 };
  for (const p of scoredPosts) breakdown[p.sentiment ?? "neutral"]++;

  return {
    intent,
    provider,
    queriesRun: queries.map((q) => ({ facet: q.facet, label: q.label, query: q.query })),
    postsConsidered: scoredPosts.length,
    cost,
    signalBreakdown: breakdown,
    clusters: cluster(scoredPosts),
    topVoices: topVoices(scoredPosts),
    topPosts: scoredPosts.slice(0, 10).map(ref),
    rawPosts: scoredPosts,
  };
}
