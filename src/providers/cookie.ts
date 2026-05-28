import {
  type Author,
  type Post,
  type ProviderStatus,
  type SearchParams,
  type XProvider,
  ProviderError,
  postUrl,
} from "./types.ts";

// Cookie provider: shells out to the `twitter-cli` tool (jackwener/public-clis),
// which uses logged-in session cookies for FREE reads. ToS-grey and fragile
// (breaks when X rotates GraphQL IDs) — opt-in only, never the default.
//
// NOTE: twitter-cli is not installed in this environment, so the JSON field
// mapping below is tolerant/best-effort. When the binary is present, verify
// the real shape and tighten `mapItem` if needed (it fails loudly on empties).

const CANDIDATE_BINS = ["twitter-cli", "twitter"];

function resolveBin(): string | null {
  for (const b of CANDIDATE_BINS) {
    if (Bun.which(b)) return b;
  }
  return null;
}

interface RawItem {
  id?: string | number;
  id_str?: string;
  rest_id?: string;
  text?: string;
  full_text?: string;
  created_at?: string;
  lang?: string;
  url?: string;
  author?: RawAuthor;
  user?: RawAuthor;
  favorite_count?: number;
  like_count?: number;
  favoriteCount?: number;
  retweet_count?: number;
  retweetCount?: number;
  reply_count?: number;
  replyCount?: number;
  quote_count?: number;
  quoteCount?: number;
  view_count?: number;
  bookmark_count?: number;
  is_retweet?: boolean;
  is_reply?: boolean;
  in_reply_to_status_id?: string;
}
interface RawAuthor {
  id?: string | number;
  screen_name?: string;
  username?: string;
  handle?: string;
  name?: string;
  followers_count?: number;
  followers?: number;
  verified?: boolean;
}

function n(...vals: Array<number | undefined>): number {
  for (const v of vals) if (typeof v === "number") return v;
  return 0;
}

function mapAuthor(a: RawAuthor | undefined): Author {
  if (!a) return {};
  return {
    id: a.id !== undefined ? String(a.id) : undefined,
    handle: a.screen_name ?? a.username ?? a.handle,
    name: a.name,
    followers: a.followers_count ?? a.followers,
    verified: a.verified,
  };
}

function mapItem(it: RawItem): Post | null {
  const id = String(it.id_str ?? it.rest_id ?? it.id ?? "");
  const text = it.full_text ?? it.text ?? "";
  if (!id || !text) return null; // unusable shape
  const author = mapAuthor(it.author ?? it.user);
  const hasUrl = (it.url ? true : false) || /https?:\/\//.test(text);
  return {
    id,
    url: postUrl(author.handle, id),
    text,
    createdAt: it.created_at,
    lang: it.lang,
    author,
    metrics: {
      likes: n(it.like_count, it.favorite_count, it.favoriteCount),
      retweets: n(it.retweet_count, it.retweetCount),
      replies: n(it.reply_count, it.replyCount),
      quotes: n(it.quote_count, it.quoteCount),
      impressions: it.view_count,
      bookmarks: it.bookmark_count,
    },
    isRetweet: it.is_retweet ?? false,
    isReply: it.is_reply ?? it.in_reply_to_status_id !== undefined,
    hasUrl,
    source: "cookie",
  };
}

function extractItems(parsed: unknown): RawItem[] {
  if (Array.isArray(parsed)) return parsed as RawItem[];
  if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    for (const key of ["data", "tweets", "results", "items"]) {
      if (Array.isArray(o[key])) return o[key] as RawItem[];
    }
  }
  return [];
}

export class CookieProvider implements XProvider {
  readonly name = "cookie" as const;
  readUnitCost = 0;
  private bin = resolveBin();

  private async run(args: string[]): Promise<Post[]> {
    if (!this.bin) {
      throw new ProviderError(
        "twitter-cli is not installed.",
        "Install with `uv tool install twitter-cli` (or `npx skills add jackwener/twitter-cli`), then log into X in a supported browser.",
      );
    }
    const proc = Bun.spawn([this.bin, ...args, "--json"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, errText, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (code !== 0) {
      throw new ProviderError(
        `twitter-cli exited ${code}.`,
        errText.trim().slice(0, 300) ||
          "Check `twitter status` — cookie auth may have expired or X changed its API.",
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(out);
    } catch {
      throw new ProviderError(
        "twitter-cli did not return valid JSON.",
        "It may have emitted YAML or a human format; verify the --json flag is supported in your version.",
      );
    }
    const items = extractItems(parsed);
    const posts = items.map(mapItem).filter((p): p is Post => p !== null);
    if (items.length > 0 && posts.length === 0) {
      throw new ProviderError(
        "twitter-cli returned data but the field mapping produced no usable posts.",
        "The JSON shape differs from what the cookie provider expects — report the raw shape so the mapper can be tightened.",
      );
    }
    return posts;
  }

  async status(): Promise<ProviderStatus> {
    const ready = this.bin !== null;
    return {
      name: this.name,
      ready,
      detail: ready
        ? `twitter-cli found (${this.bin}) — experimental, field mapping unverified against this version`
        : "twitter-cli not installed (cookie reads unavailable)",
      capabilities: {
        search: ready,
        timeline: ready,
        userLookup: ready,
        mentions: ready,
        bookmarks: ready,
      },
      readUnitCost: 0,
    };
  }

  async searchRecent(params: SearchParams): Promise<Post[]> {
    const args = ["search", params.query, "--max", String(params.maxResults ?? 25)];
    return this.run(args);
  }

  async userTimeline(handle: string, opts?: { maxResults?: number }): Promise<Post[]> {
    return this.run([
      "user-posts",
      handle.replace(/^@/, ""),
      "--max",
      String(opts?.maxResults ?? 25),
    ]);
  }

  async userLookup(handle: string): Promise<Author | null> {
    const posts = await this.run(["user", handle.replace(/^@/, "")]);
    return posts[0]?.author ?? null;
  }

  async mentions(opts?: { maxResults?: number }): Promise<Post[]> {
    return this.run(["mentions", "--max", String(opts?.maxResults ?? 25)]);
  }

  async bookmarks(opts?: { maxResults?: number }): Promise<Post[]> {
    return this.run(["bookmarks", "--max", String(opts?.maxResults ?? 25)]);
  }
}
