import { test, expect } from "bun:test";
import { buildPortfolio } from "../src/brain/portfolio.ts";

test("emits the requested number of distinct facets", () => {
  const p = buildPortfolio("agent memory context management in 2026", { size: 5 });
  expect(p.length).toBe(5);
  const facets = new Set(p.map((q) => q.facet));
  expect(facets.size).toBeGreaterThanOrEqual(4);
});

test("respects a smaller size", () => {
  expect(buildPortfolio("rust async runtimes", { size: 2 }).length).toBe(2);
});

test("all queries exclude retweets and carry shared keywords", () => {
  const p = buildPortfolio("claude code hooks system", { size: 5 });
  for (const q of p) expect(q.query).toContain("-is:retweet");
  // a salient keyword should appear across queries
  expect(p.every((q) => /hooks|claude|code|system/.test(q.query))).toBe(true);
});

test("preserves quoted phrases verbatim", () => {
  const p = buildPortfolio('experience with "context window" limits', { size: 1 });
  expect(p[0]!.query).toContain('"context window"');
});

test("injects from: targeting when accounts given", () => {
  const p = buildPortfolio("ai tooling", { accounts: ["@simonw", "swyx"], size: 6 });
  expect(p[0]!.query).toMatch(/from:simonw/);
  expect(p[0]!.query).toMatch(/from:swyx/);
});

test("applies lang and never emits engagement operators unsupported on pay-per-use", () => {
  const p = buildPortfolio("bun vs node", { lang: "en", size: 5 });
  expect(p.every((q) => q.query.includes("lang:en"))).toBe(true);
  // min_faves:/min_retweets:/min_replies: 400 on recent search — must never appear
  expect(p.every((q) => !/min_faves|min_retweets|min_replies/.test(q.query))).toBe(true);
});
