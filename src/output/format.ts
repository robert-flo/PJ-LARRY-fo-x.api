import YAML from "yaml";
import type { Post, ProviderStatus } from "../providers/types.ts";
import type { ResearchResult } from "../brain/synthesize.ts";
import { type CostEstimate, fmtUsd } from "../lib/cost.ts";

export type OutputMode = "json" | "yaml" | "compact" | "full" | "md";

function trunc(s: string, n = 180): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length > n ? oneLine.slice(0, n - 1) + "…" : oneLine;
}

function postLine(p: Post): string {
  const h = p.author.handle ? `@${p.author.handle}` : "unknown";
  const s = p.score !== undefined ? `[${p.score}] ` : "";
  return `${s}${h} ${p.url}\n    ${trunc(p.text)}`;
}

function compactPost(p: Post) {
  return {
    id: p.id,
    url: p.url,
    handle: p.author.handle,
    score: p.score,
    text: trunc(p.text, 200),
  };
}

// ---- research ----
export function formatResearch(r: ResearchResult, mode: OutputMode): string {
  if (mode === "md") return researchMd(r);
  if (mode === "yaml") return YAML.stringify(r);
  if (mode === "compact") {
    return JSON.stringify(
      {
        intent: r.intent,
        provider: r.provider,
        postsConsidered: r.postsConsidered,
        cost: r.cost.total,
        signalBreakdown: r.signalBreakdown,
        clusters: r.clusters.map((c) => ({ label: c.label, sentiment: c.sentiment, size: c.size })),
        topPosts: r.topPosts.map((p) => ({ handle: p.handle, score: p.score, url: p.url, text: trunc(p.text, 160) })),
      },
      null,
      2,
    );
  }
  return JSON.stringify(r, null, 2); // json / full
}

function researchMd(r: ResearchResult): string {
  const L: string[] = [];
  L.push(`# X research: ${r.intent}`);
  L.push("");
  L.push(`**Provider:** ${r.provider}  |  **Posts considered:** ${r.postsConsidered}  |  **Cost:** ${fmtUsd(r.cost.total)}`);
  const b = r.signalBreakdown;
  L.push(`**Signal:** ${b.pain} pain · ${b.win} wins · ${b.question} questions · ${b.neutral} neutral`);
  L.push("");
  if (r.clusters.length) {
    L.push("## Themes");
    for (const c of r.clusters) {
      L.push(`### ${c.label} _(${c.sentiment}, ${c.size} posts)_`);
      for (const p of c.topPosts) L.push(`- [${p.score}] @${p.handle}: ${trunc(p.text, 160)} — ${p.url}`);
    }
    L.push("");
  }
  L.push("## Top posts");
  for (const p of r.topPosts) L.push(`- [${p.score}] @${p.handle}: ${trunc(p.text, 160)} — ${p.url}`);
  L.push("");
  if (r.topVoices.length) {
    L.push("## Top voices");
    for (const v of r.topVoices)
      L.push(`- @${v.handle ?? "?"} (${v.posts} posts, score ${v.totalScore}) — ${v.topPost.url}`);
  }
  L.push("");
  L.push("## Queries run");
  for (const q of r.queriesRun) L.push(`- _${q.label}_: \`${q.query}\``);
  return L.join("\n");
}

// ---- post lists ----
export function formatPosts(posts: Post[], mode: OutputMode): string {
  if (mode === "yaml") return YAML.stringify(posts);
  if (mode === "compact") return JSON.stringify(posts.map(compactPost), null, 2);
  if (mode === "md") {
    if (!posts.length) return "_no posts_";
    return posts
      .map((p) => `- [${p.score ?? "-"}] @${p.author.handle ?? "?"}: ${trunc(p.text, 160)} — ${p.url}`)
      .join("\n");
  }
  if (mode === "full" && process.stdout.isTTY) {
    return posts.map(postLine).join("\n\n");
  }
  return JSON.stringify(posts, null, 2);
}

// ---- status ----
export function formatStatus(statuses: ProviderStatus[], mode: OutputMode): string {
  if (mode === "yaml") return YAML.stringify(statuses);
  if (mode === "json" || mode === "full" || mode === "compact")
    return JSON.stringify(statuses, null, 2);
  // md / default human
  const L: string[] = ["# x — provider status", ""];
  for (const s of statuses) {
    L.push(`## ${s.name} ${s.ready ? "✅ ready" : "⚠️ not ready"}`);
    L.push(s.detail);
    const caps = Object.entries(s.capabilities)
      .map(([k, v]) => `${v ? "✓" : "✗"} ${k}`)
      .join("  ");
    L.push(caps);
    L.push(`read cost: ${fmtUsd(s.readUnitCost)} / post`);
    L.push("");
  }
  return L.join("\n");
}

// ---- cost ----
export function formatCost(
  est: CostEstimate,
  meta: { intent?: string; queries?: number; provider: string },
  mode: OutputMode,
): string {
  const payload = { ...meta, ...est, totalFormatted: fmtUsd(est.total) };
  if (mode === "yaml") return YAML.stringify(payload);
  if (mode === "md") {
    return [
      `# cost estimate`,
      meta.intent ? `intent: ${meta.intent}` : "",
      `provider: ${meta.provider}`,
      meta.queries ? `queries: ${meta.queries}` : "",
      `upper-bound reads: ${est.posts}`,
      `unit cost: ${fmtUsd(est.unitCost)}`,
      `**estimated cost: ${fmtUsd(est.total)}**`,
      est.note ? `note: ${est.note}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }
  return JSON.stringify(payload, null, 2);
}
