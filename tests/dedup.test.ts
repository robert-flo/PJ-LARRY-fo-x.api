import { test, expect } from "bun:test";
import { dedupPosts, sameUtcDay } from "../src/brain/dedup.ts";
import { makePost } from "./fixtures.ts";

test("dedups by id and unions matchedQueries", () => {
  const a = makePost({ id: "1", text: "alpha" });
  const b = makePost({ id: "2", text: "beta" });
  const aAgain = makePost({ id: "1", text: "alpha" });
  const out = dedupPosts([
    { query: "q1", posts: [a, b] },
    { query: "q2", posts: [aAgain] },
  ]);
  expect(out.length).toBe(2);
  const post1 = out.find((p) => p.id === "1")!;
  expect(post1.matchedQueries!.sort()).toEqual(["q1", "q2"]);
  const post2 = out.find((p) => p.id === "2")!;
  expect(post2.matchedQueries).toEqual(["q1"]);
});

test("does not mutate the input posts", () => {
  const a = makePost({ id: "1", text: "alpha" });
  dedupPosts([{ query: "q1", posts: [a] }]);
  expect(a.matchedQueries).toBeUndefined();
});

test("sameUtcDay reflects the 24h UTC billing boundary", () => {
  expect(sameUtcDay("2026-05-28T01:00:00Z", "2026-05-28T23:00:00Z")).toBe(true);
  expect(sameUtcDay("2026-05-28T23:00:00Z", "2026-05-29T00:30:00Z")).toBe(false);
});
