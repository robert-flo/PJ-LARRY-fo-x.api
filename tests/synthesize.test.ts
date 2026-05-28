import { test, expect } from "bun:test";
import { synthesize } from "../src/brain/synthesize.ts";
import { scoreAll } from "../src/brain/score.ts";
import { buildPortfolio } from "../src/brain/portfolio.ts";
import { estimateReads } from "../src/lib/cost.ts";
import { makePost, NOW, hoursAgo } from "./fixtures.ts";

function sampleCorpus() {
  return [
    makePost({ id: "1", text: "claude code hooks keep breaking my workflow, super frustrating bug", createdAt: hoursAgo(3), author: { handle: "dev1", followers: 5000 }, metrics: { likes: 200, retweets: 30, replies: 10, quotes: 2 }, matchedQueries: ["q1", "q2"] }),
    makePost({ id: "2", text: "claude code hooks broken again after update, what a problem", createdAt: hoursAgo(5), author: { handle: "dev2", followers: 8000 }, metrics: { likes: 150, retweets: 20, replies: 5, quotes: 1 }, matchedQueries: ["q2"] }),
    makePost({ id: "3", text: "finally solved the claude code skills issue with a clean workaround, love it", createdAt: hoursAgo(2), author: { handle: "dev1", followers: 5000 }, metrics: { likes: 400, retweets: 60, replies: 8, quotes: 5 }, matchedQueries: ["q3"] }),
    makePost({ id: "4", text: "how do you all handle agent memory between sessions? best approach?", createdAt: hoursAgo(6), author: { handle: "dev3", followers: 1200 }, metrics: { likes: 30, retweets: 2, replies: 12, quotes: 0 }, matchedQueries: ["q4"] }),
  ];
}

test("produces breakdown, clusters, voices, and analysis/raw split", () => {
  const scored = scoreAll(sampleCorpus(), { now: NOW, facetCount: 4 });
  const queries = buildPortfolio("claude code hooks and skills", { size: 4 });
  const cost = estimateReads(scored.length, 0.005);
  const r = synthesize("claude code hooks and skills", "official", queries, scored, cost);

  expect(r.postsConsidered).toBe(4);
  expect(r.signalBreakdown.pain).toBeGreaterThanOrEqual(2);
  expect(r.signalBreakdown.win).toBeGreaterThanOrEqual(1);
  expect(r.signalBreakdown.question).toBeGreaterThanOrEqual(1);
  expect(r.topPosts.length).toBeGreaterThan(0);
  expect(r.rawPosts.length).toBe(4);
  // dev1 has two posts → should surface as a top voice
  expect(r.topVoices.some((v) => v.handle === "dev1" && v.posts === 2)).toBe(true);
  // every cited post carries an id + url
  for (const p of r.topPosts) {
    expect(p.id).toBeTruthy();
    expect(p.url).toContain("x.com");
  }
});

test("clusters group the two 'hooks broken' pain posts together", () => {
  const scored = scoreAll(sampleCorpus(), { now: NOW, facetCount: 4 });
  const r = synthesize("x", "official", [], scored, estimateReads(4, 0.005));
  const painCluster = r.clusters.find((c) => c.size >= 2);
  expect(painCluster).toBeDefined();
});
