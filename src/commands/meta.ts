import type { CliOptions } from "../options.ts";
import { allStatuses } from "../providers/index.ts";
import { buildPortfolio } from "../brain/portfolio.ts";
import { estimateResearch, unitCostForChoice } from "../lib/cost.ts";
import { formatStatus, formatCost } from "../output/format.ts";

export async function cmdStatus(opts: CliOptions): Promise<string> {
  return formatStatus(await allStatuses(), opts.mode);
}

// `x cost "<intent>"` — preview the upper-bound cost of a research run without
// spending anything (no network, no creds needed).
export async function cmdCost(intent: string, opts: CliOptions): Promise<string> {
  const queries = buildPortfolio(intent, {
    lang: opts.lang,
    accounts: opts.accounts,
    size: opts.queries,
  });
  const perQuery = Math.min(100, Math.max(10, Math.floor(opts.maxPosts / queries.length)));
  const est = estimateResearch(queries.length, perQuery, unitCostForChoice(opts.provider));
  return formatCost(
    est,
    { intent, queries: queries.length, provider: opts.provider },
    opts.mode,
  );
}
