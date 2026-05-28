import { test, expect } from "bun:test";
import { formatPosts, formatResearch, formatCost } from "../src/output/format.ts";
import { scoreAll } from "../src/brain/score.ts";
import { synthesize } from "../src/brain/synthesize.ts";
import { estimateReads } from "../src/lib/cost.ts";
import { makePost, NOW, hoursAgo } from "./fixtures.ts";

const posts = () =>
  scoreAll(
    [
      makePost({ id: "1", text: "alpha bravo charlie", createdAt: hoursAgo(2), author: { handle: "a", followers: 100 }, metrics: { likes: 10, retweets: 1, replies: 0, quotes: 0 } }),
      makePost({ id: "2", text: "delta echo foxtrot", createdAt: hoursAgo(3), author: { handle: "b", followers: 200 }, metrics: { likes: 20, retweets: 2, replies: 1, quotes: 0 } }),
    ],
    { now: NOW },
  );

test("compact post output drops heavy fields and stays valid JSON", () => {
  const out = formatPosts(posts(), "compact");
  const parsed = JSON.parse(out);
  expect(Array.isArray(parsed)).toBe(true);
  expect(parsed[0]).toHaveProperty("url");
  expect(parsed[0]).toHaveProperty("score");
  expect(parsed[0]).not.toHaveProperty("metrics");
});

test("json post output is valid and complete", () => {
  const parsed = JSON.parse(formatPosts(posts(), "json"));
  expect(parsed[0]).toHaveProperty("metrics");
});

test("research compact output is valid JSON with no rawPosts", () => {
  const scored = posts();
  const r = synthesize("intent", "official", [], scored, estimateReads(2, 0.005));
  const parsed = JSON.parse(formatResearch(r, "compact"));
  expect(parsed).toHaveProperty("topPosts");
  expect(parsed).not.toHaveProperty("rawPosts");
});

test("research md output is human-readable text", () => {
  const r = synthesize("my intent", "official", [], posts(), estimateReads(2, 0.005));
  const md = formatResearch(r, "md");
  expect(md).toContain("# X research: my intent");
  expect(md).toContain("Top posts");
});

test("cost output reports a formatted total", () => {
  const parsed = JSON.parse(formatCost(estimateReads(50, 0.005), { provider: "official" }, "json"));
  expect(parsed.total).toBe(0.25);
  expect(parsed.totalFormatted).toBe("$0.25");
});
