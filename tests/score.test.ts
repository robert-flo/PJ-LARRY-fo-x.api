import { test, expect } from "bun:test";
import { scorePost, scoreAll } from "../src/brain/score.ts";
import { makePost, NOW, hoursAgo } from "./fixtures.ts";

test("is deterministic for fixed inputs and now", () => {
  const p = makePost({
    id: "1",
    text: "great post",
    createdAt: hoursAgo(2),
    metrics: { likes: 100, retweets: 10, replies: 5, quotes: 2 },
  });
  const a = scorePost(p, { now: NOW });
  const b = scorePost(p, { now: NOW });
  expect(a).toBe(b);
  expect(a).toBeGreaterThan(0);
  expect(a).toBeLessThanOrEqual(100);
});

test("higher engagement scores higher", () => {
  const base = { createdAt: hoursAgo(2) };
  const lo = makePost({ id: "1", text: "x", ...base, metrics: { likes: 1, retweets: 0, replies: 0, quotes: 0 } });
  const hi = makePost({ id: "2", text: "x", ...base, metrics: { likes: 5000, retweets: 800, replies: 50, quotes: 100 } });
  expect(scorePost(hi, { now: NOW })).toBeGreaterThan(scorePost(lo, { now: NOW }));
});

test("recent posts score higher than stale ones, all else equal", () => {
  const m = { likes: 100, retweets: 10, replies: 2, quotes: 1 };
  const fresh = makePost({ id: "1", text: "x", createdAt: hoursAgo(1), metrics: m });
  const stale = makePost({ id: "2", text: "x", createdAt: hoursAgo(240), metrics: m });
  expect(scorePost(fresh, { now: NOW })).toBeGreaterThan(scorePost(stale, { now: NOW }));
});

test("project context boosts a relevant post", () => {
  const m = { likes: 50, retweets: 5, replies: 1, quotes: 0 };
  const relevant = makePost({ id: "1", text: "claude code hooks broke my skill workflow", createdAt: hoursAgo(3), metrics: m });
  const off = makePost({ id: "2", text: "lunch was tasty today downtown", createdAt: hoursAgo(3), metrics: m });
  const ctx = { context: "claude code hooks skills workflow", now: NOW };
  expect(scorePost(relevant, ctx)).toBeGreaterThan(scorePost(off, ctx));
});

test("scoreAll sorts descending and annotates score", () => {
  const posts = [
    makePost({ id: "1", text: "a", createdAt: hoursAgo(2), metrics: { likes: 1, retweets: 0, replies: 0, quotes: 0 } }),
    makePost({ id: "2", text: "b", createdAt: hoursAgo(2), metrics: { likes: 9000, retweets: 500, replies: 10, quotes: 20 } }),
  ];
  const sorted = scoreAll(posts, { now: NOW });
  expect(sorted[0]!.id).toBe("2");
  expect(sorted[0]!.score).toBeGreaterThan(sorted[1]!.score!);
});
