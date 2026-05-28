import type { CliOptions } from "../options.ts";
import { resolveProvider } from "../providers/index.ts";
import { ProviderError, type Post } from "../providers/types.ts";
import { buildPortfolio } from "../brain/portfolio.ts";
import { dedupPosts } from "../brain/dedup.ts";
import { scoreAll } from "../brain/score.ts";
import { synthesize } from "../brain/synthesize.ts";
import { estimateResearch, estimateReads, fmtUsd, unitCostForChoice } from "../lib/cost.ts";
import { formatResearch, formatCost } from "../output/format.ts";
import { parseSince } from "../lib/time.ts";
import { warn, info } from "../lib/log.ts";

export async function cmdResearch(intent: string, opts: CliOptions): Promise<string> {
  if (!intent.trim()) throw new ProviderError("research needs an intent string.");

  const queries = buildPortfolio(intent, {
    lang: opts.lang,
    accounts: opts.accounts,
    size: opts.queries,
  });
  const perQuery = Math.min(100, Math.max(10, Math.floor(opts.maxPosts / queries.length)));

  // Dry-run estimates cost without needing a live provider or credentials.
  if (opts.dryRun) {
    const est = estimateResearch(queries.length, perQuery, unitCostForChoice(opts.provider));
    return formatCost(est, { intent, queries: queries.length, provider: opts.provider }, opts.mode);
  }

  const provider = await resolveProvider(opts.provider);
  const upper = estimateResearch(queries.length, perQuery, provider.readUnitCost);
  if (opts.maxCost !== undefined && upper.total > opts.maxCost) {
    throw new ProviderError(
      `Estimated cost ${fmtUsd(upper.total)} exceeds --max-cost ${fmtUsd(opts.maxCost)}.`,
      "Lower --max-posts/--queries, use --provider cookie, or raise --max-cost. Run `x cost` to preview.",
    );
  }

  let since: string | undefined;
  if (opts.since) {
    const parsed = parseSince(opts.since);
    if (!parsed) warn(`could not parse --since "${opts.since}"; ignoring`);
    else {
      since = parsed.iso;
      if (parsed.clamped) warn("--since clamped to 7 days (recent search limit)");
    }
  }

  // Run the portfolio. Tolerate per-query failures; only abort if all fail.
  const settled = await Promise.allSettled(
    queries.map((q) =>
      provider.searchRecent({ query: q.query, maxResults: perQuery, since, lang: opts.lang }),
    ),
  );
  const batches: Array<{ query: string; posts: Post[] }> = [];
  const errors: string[] = [];
  settled.forEach((res, i) => {
    const q = queries[i];
    if (!q) return;
    if (res.status === "fulfilled") batches.push({ query: q.query, posts: res.value });
    else errors.push(res.reason instanceof Error ? res.reason.message : String(res.reason));
  });
  if (batches.length === 0) {
    throw new ProviderError(`All ${queries.length} queries failed.`, errors[0]);
  }
  if (errors.length) warn(`${errors.length}/${queries.length} queries failed: ${errors[0]}`);

  const deduped = dedupPosts(batches);
  const scored = scoreAll(deduped, { context: opts.context, facetCount: queries.length });
  // Engagement filtering is post-fetch (min_faves: 400s on this tier).
  const analyzed = opts.minFaves
    ? scored.filter((p) => p.metrics.likes >= opts.minFaves!)
    : scored;
  info(
    `${scored.length} unique posts from ${batches.length} queries` +
      (opts.minFaves ? `, ${analyzed.length} ≥ ${opts.minFaves} likes` : ""),
  );

  // Billed reads dedup within 24h UTC → the unique fetched count is the real cost.
  const actualCost = estimateReads(scored.length, provider.readUnitCost);

  const result = synthesize(intent, provider.name, queries, analyzed, actualCost);
  return formatResearch(result, opts.mode);
}
