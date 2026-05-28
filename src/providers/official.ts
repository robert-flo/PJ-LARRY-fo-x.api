import { Client } from "@xdevplatform/xdk";
import {
  type Author,
  type Post,
  type ProviderStatus,
  type SearchParams,
  type XProvider,
  ProviderError,
  postUrl,
} from "./types.ts";
import {
  credState,
  getBearer,
  getUserToken,
  BEARER_ENV_HINT,
  USER_TOKEN_ENV_HINT,
} from "../lib/config.ts";
import { PRICING } from "../lib/cost.ts";

const TWEET_FIELDS = [
  "created_at",
  "public_metrics",
  "author_id",
  "lang",
  "entities",
  "referenced_tweets",
];
const USER_FIELDS = ["username", "name", "public_metrics", "verified"];
const EXPANSIONS = ["author_id"];

// Minimal structural views over the XDK's loosely-typed response objects.
interface RawUser {
  id?: string;
  username?: string;
  name?: string;
  verified?: boolean;
  publicMetrics?: Record<string, number>;
  public_metrics?: Record<string, number>;
}
interface RawTweet {
  id?: string;
  text?: string;
  createdAt?: string;
  created_at?: string;
  authorId?: string;
  author_id?: string;
  lang?: string;
  publicMetrics?: Record<string, number>;
  public_metrics?: Record<string, number>;
  inReplyToUserId?: string;
  in_reply_to_user_id?: string;
  referencedTweets?: Array<{ type?: string; id?: string }>;
  referenced_tweets?: Array<{ type?: string; id?: string }>;
  entities?: { urls?: unknown[] };
}
interface RawResponse {
  data?: RawTweet[];
  includes?: { users?: RawUser[] };
  meta?: Record<string, unknown>;
  errors?: Array<{ title?: string; detail?: string }>;
}

// The XDK deep-camelCases response keys (likeCount, followersCount, ...). We
// read camelCase first and fall back to snake_case for robustness/raw shapes.
function metric(pm: Record<string, number> | undefined, camel: string, snake: string): number {
  return pm?.[camel] ?? pm?.[snake] ?? 0;
}

function mapAuthor(u: RawUser): Author {
  const pm = u.publicMetrics ?? u.public_metrics;
  return {
    id: u.id,
    handle: u.username,
    name: u.name,
    followers: pm?.followersCount ?? pm?.followers_count,
    verified: u.verified,
  };
}

function mapTweet(t: RawTweet, authors: Map<string, Author>): Post {
  const pm = t.publicMetrics ?? t.public_metrics;
  const authorId = t.authorId ?? t.author_id ?? "";
  const author = authors.get(authorId) ?? { id: authorId };
  const refs = t.referencedTweets ?? t.referenced_tweets ?? [];
  const isRetweet = refs.some((r) => r.type === "retweeted");
  const isReply =
    refs.some((r) => r.type === "replied_to") ||
    (t.inReplyToUserId ?? t.in_reply_to_user_id) !== undefined;
  const text = t.text ?? "";
  const hasUrl = (t.entities?.urls?.length ?? 0) > 0 || /https?:\/\//.test(text);
  const id = t.id ?? "";
  return {
    id,
    url: postUrl(author.handle, id),
    text,
    createdAt: t.createdAt ?? t.created_at,
    lang: t.lang,
    author,
    metrics: {
      likes: metric(pm, "likeCount", "like_count"),
      retweets: metric(pm, "retweetCount", "retweet_count"),
      replies: metric(pm, "replyCount", "reply_count"),
      quotes: metric(pm, "quoteCount", "quote_count"),
      impressions: pm?.impressionCount ?? pm?.impression_count,
      bookmarks: pm?.bookmarkCount ?? pm?.bookmark_count,
    },
    isRetweet,
    isReply,
    hasUrl,
    source: "official",
  };
}

function mapResponse(res: RawResponse): Post[] {
  if (res.errors?.length && !res.data?.length) {
    const e = res.errors[0];
    throw new ProviderError(
      `X API error: ${e?.title ?? "unknown"}${e?.detail ? ` — ${e.detail}` : ""}`,
    );
  }
  const authors = new Map<string, Author>();
  for (const u of res.includes?.users ?? []) {
    if (u.id) authors.set(u.id, mapAuthor(u));
  }
  return (res.data ?? []).map((t) => mapTweet(t, authors));
}

function clampMax(n: number | undefined): number {
  // recent search allows 10-100 per request
  return Math.min(100, Math.max(10, n ?? 25));
}

export class OfficialProvider implements XProvider {
  readonly name = "official" as const;
  readUnitCost = PRICING.postRead;

  private bearerClient(): Client {
    const token = getBearer();
    if (!token) {
      throw new ProviderError(
        "No X API bearer token configured.",
        `Set ${BEARER_ENV_HINT} in your environment (create an app on console.x.com, pay-per-use package).`,
      );
    }
    return new Client({ bearerToken: token });
  }

  private userClient(): Client {
    const token = getUserToken();
    if (!token) {
      throw new ProviderError(
        "Owned reads (mentions/bookmarks) need an OAuth2 user-context token.",
        `Set ${USER_TOKEN_ENV_HINT} with scopes tweet.read + users.read + bookmark.read.`,
      );
    }
    return new Client({ accessToken: token });
  }

  async status(): Promise<ProviderStatus> {
    const c = credState();
    return {
      name: this.name,
      ready: c.hasBearer,
      detail: c.hasBearer
        ? `bearer token present${c.hasUserToken ? " + user token (owned reads enabled)" : " (owned reads need a user token)"}`
        : `no bearer token — set ${BEARER_ENV_HINT}`,
      capabilities: {
        search: c.hasBearer,
        timeline: c.hasBearer,
        userLookup: c.hasBearer,
        mentions: c.hasUserToken,
        bookmarks: c.hasUserToken,
      },
      readUnitCost: this.readUnitCost,
    };
  }

  async searchRecent(params: SearchParams): Promise<Post[]> {
    const client = this.bearerClient();
    const opts: Record<string, unknown> = {
      maxResults: clampMax(params.maxResults),
      // relevancy (vs default recency) surfaces engaged/high-signal posts rather
      // than just the newest 0-engagement ones — core to research signal quality
      sortOrder: "relevancy",
      tweetFields: TWEET_FIELDS,
      userFields: USER_FIELDS,
      expansions: EXPANSIONS,
    };
    if (params.since) opts.startTime = params.since;
    try {
      const res = (await client.posts.searchRecent(
        params.query,
        opts,
      )) as RawResponse;
      return mapResponse(res);
    } catch (err) {
      throw wrap(err, "search");
    }
  }

  async userLookup(handle: string): Promise<Author | null> {
    const client = this.bearerClient();
    try {
      const res = (await client.users.getByUsername(stripAt(handle), {
        userFields: USER_FIELDS,
      } as Record<string, unknown>)) as { data?: RawUser };
      return res.data ? mapAuthor(res.data) : null;
    } catch (err) {
      throw wrap(err, "user lookup");
    }
  }

  async userTimeline(
    handle: string,
    opts?: { maxResults?: number },
  ): Promise<Post[]> {
    const author = await this.userLookup(handle);
    if (!author?.id) throw new ProviderError(`User @${stripAt(handle)} not found.`);
    const client = this.bearerClient();
    try {
      // getPosts → /2/users/:id/tweets (public posts, app-only ok). NOT
      // getTimeline, which is the authed user's home timeline (needs user token).
      const res = (await client.users.getPosts(author.id, {
        maxResults: clampMax(opts?.maxResults),
        tweetFields: TWEET_FIELDS,
        userFields: USER_FIELDS,
        expansions: EXPANSIONS,
      } as Record<string, unknown>)) as RawResponse;
      return mapResponse(res);
    } catch (err) {
      throw wrap(err, "timeline");
    }
  }

  async mentions(opts?: { maxResults?: number }): Promise<Post[]> {
    const client = this.userClient();
    const me = (await client.users.getMe()) as { data?: RawUser };
    if (!me.data?.id) throw new ProviderError("Could not resolve authenticated user.");
    const res = (await client.users.getMentions(me.data.id, {
      maxResults: clampMax(opts?.maxResults),
      tweetFields: TWEET_FIELDS,
      userFields: USER_FIELDS,
      expansions: EXPANSIONS,
    } as Record<string, unknown>)) as RawResponse;
    return mapResponse(res);
  }

  async bookmarks(opts?: { maxResults?: number }): Promise<Post[]> {
    const client = this.userClient();
    const me = (await client.users.getMe()) as { data?: RawUser };
    if (!me.data?.id) throw new ProviderError("Could not resolve authenticated user.");
    const res = (await client.users.getBookmarks(me.data.id, {
      maxResults: clampMax(opts?.maxResults),
      tweetFields: TWEET_FIELDS,
      userFields: USER_FIELDS,
      expansions: EXPANSIONS,
    } as Record<string, unknown>)) as RawResponse;
    return mapResponse(res);
  }
}

function stripAt(h: string): string {
  return h.replace(/^@/, "").trim();
}

function wrap(err: unknown, op: string): ProviderError {
  const msg = err instanceof Error ? err.message : String(err);
  if (/401|unauthor/i.test(msg)) {
    return new ProviderError(
      `Auth rejected during ${op}.`,
      "Check your token is valid and the app is on the pay-per-use package + production environment.",
    );
  }
  if (/403|forbidden/i.test(msg)) {
    return new ProviderError(
      `Forbidden during ${op}.`,
      "This endpoint may require a higher access tier than pay-per-use (e.g. full-archive search is Pro/Enterprise only).",
    );
  }
  if (/429|rate/i.test(msg)) {
    return new ProviderError(`Rate limited during ${op}.`, "Wait and retry.");
  }
  return new ProviderError(`${op} failed: ${msg}`);
}
