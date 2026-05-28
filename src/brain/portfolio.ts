import { keywords, extractQuoted } from "./text.ts";

export interface PortfolioQuery {
  facet: "broad" | "pain" | "wins" | "debate" | "wide";
  query: string;
  label: string;
}

export interface PortfolioOptions {
  lang?: string;
  accounts?: string[]; // from:handle targeting
  size?: number; // number of facets to emit (1-5)
}

// Build an X search-operator string from a base term set + facet modifier.
function build(
  base: string,
  modifier: string,
  opts: PortfolioOptions,
): string {
  const parts = [base];
  if (modifier) parts.push(modifier);
  parts.push("-is:retweet");
  if (opts.lang) parts.push(`lang:${opts.lang}`);
  return parts.filter(Boolean).join(" ").trim();
}

// Turn a natural-language research intent into a small portfolio of distinct,
// angle-diverse search queries. Deterministic — no LLM call.
export function buildPortfolio(
  intent: string,
  opts: PortfolioOptions = {},
): PortfolioQuery[] {
  const quoted = extractQuoted(intent);
  const kws = keywords(intent, 6).filter(
    (k) => !quoted.some((q) => q.toLowerCase().includes(k)),
  );

  // Core term set: quoted phrases (verbatim) + a few top keywords. Kept small
  // (≤3) because X search AND-joins terms — too many collapses results to zero.
  const coreTerms = [
    ...quoted.map((q) => `"${q}"`),
    ...kws.slice(0, 3),
  ];
  const base = coreTerms.length > 0 ? coreTerms.join(" ") : intent.trim();

  // NOTE: engagement operators (min_faves: etc.) 400 on pay-per-use recent
  // search — they're Pro/Enterprise-only. Signal ranking happens post-fetch in
  // the scorer instead. Only core operators are used here.
  const facets: PortfolioQuery[] = [
    {
      facet: "broad",
      label: "clean originals (no replies)",
      query: build(base, "-is:reply", opts),
    },
    {
      facet: "pain",
      label: "pain points / complaints",
      query: build(
        base,
        '(problem OR issue OR broken OR frustrating OR "doesn\'t work" OR struggling)',
        opts,
      ),
    },
    {
      facet: "wins",
      label: "solutions / wins / workarounds",
      query: build(
        base,
        '(solved OR workaround OR "figured out" OR tip OR finally OR recommend)',
        opts,
      ),
    },
    {
      facet: "debate",
      label: "questions / comparisons / debate",
      query: build(base, '(how OR why OR "best way" OR vs OR alternative)', opts),
    },
    {
      facet: "wide",
      label: "wide net (includes replies)",
      query: build(base, "", opts),
    },
  ];

  if (opts.accounts?.length) {
    const from = opts.accounts.map((a) => `from:${a.replace(/^@/, "")}`).join(" OR ");
    facets.unshift({
      facet: "broad",
      label: "key accounts",
      query: build(`${base} (${from})`, "", opts),
    });
  }

  const size = Math.min(Math.max(opts.size ?? 5, 1), facets.length);
  return facets.slice(0, size);
}
