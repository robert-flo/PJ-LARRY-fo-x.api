import YAML from "yaml";
import type { CliOptions } from "../options.ts";
import { resolveProvider } from "../providers/index.ts";
import { ProviderError } from "../providers/types.ts";
import { scoreAll } from "../brain/score.ts";
import { formatPosts, formatCost } from "../output/format.ts";
import { estimateReads, unitCostForChoice } from "../lib/cost.ts";
import { parseSince } from "../lib/time.ts";
import { warn } from "../lib/log.ts";

function resolveSince(opts: CliOptions): string | undefined {
  if (!opts.since) return undefined;
  const parsed = parseSince(opts.since);
  if (!parsed) {
    warn(`could not parse --since "${opts.since}"; ignoring`);
    return undefined;
  }
  if (parsed.clamped) warn("--since clamped to 7 days (recent search limit)");
  return parsed.iso;
}

// `x search "<query|intent>"` — single query, scored + sorted. Accepts raw
// X operators or a plain phrase (passed through as-is).
export async function cmdSearch(query: string, opts: CliOptions): Promise<string> {
  if (!query.trim()) throw new ProviderError("search needs a query.");

  if (opts.dryRun) {
    const est = estimateReads(opts.limit, unitCostForChoice(opts.provider));
    return formatCost(est, { intent: query, provider: opts.provider }, opts.mode);
  }

  const provider = await resolveProvider(opts.provider);
  const posts = await provider.searchRecent({
    query,
    maxResults: opts.limit,
    since: resolveSince(opts),
    lang: opts.lang,
  });
  const scored = scoreAll(posts, { context: opts.context, facetCount: 1 });
  const out = opts.minFaves ? scored.filter((p) => p.metrics.likes >= opts.minFaves!) : scored;
  return formatPosts(out, opts.mode);
}

export async function cmdTimeline(handle: string, opts: CliOptions): Promise<string> {
  if (!handle.trim()) throw new ProviderError("timeline needs a @handle.");
  const provider = await resolveProvider(opts.provider);
  const posts = await provider.userTimeline(handle, { maxResults: opts.limit });
  return formatPosts(scoreAll(posts, { context: opts.context, facetCount: 1 }), opts.mode);
}

export async function cmdUser(handle: string, opts: CliOptions): Promise<string> {
  if (!handle.trim()) throw new ProviderError("user needs a @handle.");
  const provider = await resolveProvider(opts.provider);
  const author = await provider.userLookup(handle);
  if (!author) throw new ProviderError(`User @${handle.replace(/^@/, "")} not found.`);
  if (opts.mode === "yaml") return YAML.stringify(author);
  if (opts.mode === "md")
    return `# @${author.handle}\n${author.name ?? ""}\nfollowers: ${author.followers ?? "?"}  verified: ${author.verified ?? false}`;
  return JSON.stringify(author, null, 2);
}

export async function cmdMentions(opts: CliOptions): Promise<string> {
  const provider = await resolveProvider(opts.provider);
  const posts = await provider.mentions({ maxResults: opts.limit });
  return formatPosts(scoreAll(posts, { facetCount: 1 }), opts.mode);
}

export async function cmdBookmarks(opts: CliOptions): Promise<string> {
  const provider = await resolveProvider(opts.provider);
  const posts = await provider.bookmarks({ maxResults: opts.limit });
  return formatPosts(scoreAll(posts, { facetCount: 1 }), opts.mode);
}
