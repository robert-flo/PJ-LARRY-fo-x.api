// Normalized data shapes shared across providers and the research brain.
// Every provider maps its raw API/CLI output into these so the brain and
// output layer never care where a post came from.

export type ProviderName = "official" | "cookie";

export interface Author {
  id?: string;
  handle?: string; // without leading @
  name?: string;
  followers?: number;
  verified?: boolean;
}

export interface Metrics {
  likes: number;
  retweets: number;
  replies: number;
  quotes: number;
  impressions?: number;
  bookmarks?: number;
}

export interface Post {
  id: string;
  url: string;
  text: string;
  createdAt?: string; // ISO 8601
  lang?: string;
  author: Author;
  metrics: Metrics;
  isRetweet: boolean;
  isReply: boolean;
  hasUrl: boolean;
  source: ProviderName;
  // Filled in by the research brain:
  score?: number;
  matchedQueries?: string[];
  sentiment?: Sentiment;
}

export type Sentiment = "pain" | "win" | "question" | "neutral";

export interface SearchParams {
  query: string;
  maxResults?: number;
  since?: string; // ISO start time
  lang?: string;
}

export interface ProviderStatus {
  name: ProviderName;
  ready: boolean;
  detail: string; // human-readable, never contains secret values
  capabilities: {
    search: boolean;
    timeline: boolean;
    userLookup: boolean;
    mentions: boolean; // owned read
    bookmarks: boolean; // owned read
  };
  readUnitCost: number; // USD per post read ($0 for cookie)
}

export interface XProvider {
  readonly name: ProviderName;
  readUnitCost: number;
  status(): Promise<ProviderStatus>;
  searchRecent(params: SearchParams): Promise<Post[]>;
  userTimeline(handle: string, opts?: { maxResults?: number }): Promise<Post[]>;
  userLookup(handle: string): Promise<Author | null>;
  mentions(opts?: { maxResults?: number }): Promise<Post[]>;
  bookmarks(opts?: { maxResults?: number }): Promise<Post[]>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export function postUrl(handle: string | undefined, id: string): string {
  return `https://x.com/${handle ?? "i"}/status/${id}`;
}
