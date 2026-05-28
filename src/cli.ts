#!/usr/bin/env bun
import { parseArgs } from "node:util";
import type { CliOptions } from "./options.ts";
import type { OutputMode } from "./output/format.ts";
import type { ProviderChoice } from "./providers/index.ts";
import { ProviderError } from "./providers/types.ts";
import { cmdResearch } from "./commands/research.ts";
import { cmdSearch, cmdTimeline, cmdUser, cmdMentions, cmdBookmarks } from "./commands/reads.ts";
import { cmdStatus, cmdCost } from "./commands/meta.ts";

const VERSION = "0.1.0";

const HELP = `x — X research specialist for AI coworkers (v${VERSION})

USAGE
  x <command> [args] [flags]

RESEARCH
  x research "<intent>"   Multi-query recon: portfolio → dedup → score → synthesize (the star)
  x cost "<intent>"       Preview estimated $ for a research run (no spend, no creds needed)

READS
  x search "<query>"      Single search (raw X operators or a plain phrase), scored
  x timeline <@handle>    A user's recent posts, scored
  x user <@handle>        User profile lookup
  x mentions              Your mentions (needs OAuth2 user token)
  x bookmarks             Your bookmarks (needs OAuth2 user token)

META
  x status                Which providers are live (no secrets shown)
  x help                  This text

OUTPUT (default: json)
  --json --yaml --compact --full --md

KEY FLAGS
  --provider <official|cookie|auto>   default official
  --since <7d|24h|2026-05-20>         recent search only (≤7 days)
  --context "<project context>"       boosts relevance scoring in research
  --max-posts <N>     research read budget (default 75)
  --max-cost <USD>    refuse a research run estimated above this
  --limit <N>         per-call result cap for single reads (default 25)
  --queries <N>       portfolio size for research (1-6, default 5)
  --min-faves <N>     post-fetch filter: drop posts under N likes
  --accounts a,b,c    target specific @handles in research
  --dry-run           estimate cost instead of running

COST (pay-per-use, 2026): post read $0.005 · owned read $0.001 · cookie reads free.
SECRETS: tokens come from env (X_API_BEARER_TOKEN); x never prints them.
`;

function pickMode(v: Record<string, unknown>): OutputMode {
  if (v.yaml) return "yaml";
  if (v.compact) return "compact";
  if (v.full) return "full";
  if (v.md) return "md";
  return "json";
}

function intFlag(v: unknown, def: number): number {
  if (typeof v !== "string") return def;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}
function floatFlag(v: unknown): number | undefined {
  if (typeof v !== "string") return undefined;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    allowPositionals: true,
    strict: false,
    options: {
      json: { type: "boolean" },
      yaml: { type: "boolean" },
      compact: { type: "boolean" },
      full: { type: "boolean" },
      md: { type: "boolean" },
      provider: { type: "string" },
      since: { type: "string" },
      context: { type: "string" },
      lang: { type: "string" },
      "max-posts": { type: "string" },
      "max-cost": { type: "string" },
      limit: { type: "string" },
      queries: { type: "string" },
      "min-faves": { type: "string" },
      accounts: { type: "string" },
      "dry-run": { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean" },
    },
  });

  const command = (positionals[0] ?? "").toLowerCase();
  const arg = positionals[1] ?? "";

  if (values.version) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  if (values.help || command === "" || command === "help") {
    process.stdout.write(HELP);
    return;
  }

  const providerRaw = (typeof values.provider === "string" ? values.provider : "official").toLowerCase();
  if (!["official", "cookie", "auto"].includes(providerRaw)) {
    throw new ProviderError(`Unknown --provider "${providerRaw}". Use official, cookie, or auto.`);
  }

  const opts: CliOptions = {
    mode: pickMode(values),
    provider: providerRaw as ProviderChoice,
    since: typeof values.since === "string" ? values.since : undefined,
    context: typeof values.context === "string" ? values.context : undefined,
    lang: typeof values.lang === "string" ? values.lang : undefined,
    maxPosts: intFlag(values["max-posts"], 75),
    maxCost: floatFlag(values["max-cost"]),
    limit: intFlag(values.limit, 25),
    queries: Math.min(6, Math.max(1, intFlag(values.queries, 5))),
    minFaves: typeof values["min-faves"] === "string" ? intFlag(values["min-faves"], 0) : undefined,
    accounts:
      typeof values.accounts === "string"
        ? values.accounts.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined,
    dryRun: !!values["dry-run"],
  };

  let out: string;
  switch (command) {
    case "research": out = await cmdResearch(arg, opts); break;
    case "search": out = await cmdSearch(arg, opts); break;
    case "timeline": out = await cmdTimeline(arg, opts); break;
    case "user": out = await cmdUser(arg, opts); break;
    case "mentions": out = await cmdMentions(opts); break;
    case "bookmarks": out = await cmdBookmarks(opts); break;
    case "status": out = await cmdStatus(opts); break;
    case "cost": out = await cmdCost(arg, opts); break;
    default:
      throw new ProviderError(`Unknown command "${command}". Run \`x help\`.`);
  }
  process.stdout.write(out.endsWith("\n") ? out : out + "\n");
}

main().catch((err: unknown) => {
  if (err instanceof ProviderError) {
    process.stderr.write(`x: ${err.message}\n`);
    if (err.hint) process.stderr.write(`   ↳ ${err.hint}\n`);
  } else {
    process.stderr.write(`x: ${err instanceof Error ? err.message : String(err)}\n`);
  }
  process.exitCode = 1;
});
