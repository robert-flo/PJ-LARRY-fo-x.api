// OAuth2 user-context auth for owned reads (mentions/bookmarks). Wraps the
// XDK's OAuth2 PKCE helper. Two entry points: runAuthFlow() (interactive,
// one-time, human-in-a-TTY) and getValidUserAccessToken() (silent refresh used
// by the provider before every owned read). Token VALUES live only here and in
// config.ts; nothing is ever logged.

import {
  Client,
  OAuth2,
  generateCodeVerifier,
  generateCodeChallenge,
  type OAuth2Config,
  type OAuth2Token,
} from "@xdevplatform/xdk";
import {
  getClientId,
  getClientSecret,
  getRedirectUri,
  getUserToken,
  getRefreshToken,
  getTokenExpiresAt,
  persistSecrets,
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  EXPIRES_KEY,
  CLIENT_ID_ENV_HINT,
  ENV_FILE,
} from "./config.ts";
import { ProviderError } from "../providers/types.ts";

// tweet.read + users.read are the baseline owned-read scopes; bookmark.read
// unlocks GET /2/users/:id/bookmarks; offline.access returns a refresh token so
// the ~2h access token can be renewed silently instead of forcing a re-login.
export const OAUTH_SCOPES = [
  "tweet.read",
  "users.read",
  "bookmark.read",
  "offline.access",
];

function buildOAuth2(): OAuth2 {
  const clientId = getClientId();
  if (!clientId) {
    throw new ProviderError(
      "No OAuth2 client id configured.",
      `Set ${CLIENT_ID_ENV_HINT} in ${ENV_FILE} (console.x.com → your app → User authentication settings → OAuth 2.0 Client ID), then run \`x auth\`.`,
    );
  }
  const config: OAuth2Config = {
    clientId,
    redirectUri: getRedirectUri(),
    scope: OAUTH_SCOPES,
  };
  const secret = getClientSecret();
  if (secret) config.clientSecret = secret; // confidential client; omit for public/PKCE
  return new OAuth2(config);
}

// X rotates the refresh token on every refresh, so we re-persist the whole set.
function persistTokenSet(tok: OAuth2Token): void {
  const updates: Record<string, string> = { [ACCESS_TOKEN_KEY]: tok.access_token };
  if (tok.refresh_token) updates[REFRESH_TOKEN_KEY] = tok.refresh_token;
  if (tok.expires_in) updates[EXPIRES_KEY] = String(Date.now() + tok.expires_in * 1000);
  persistSecrets(updates);
}

export interface AuthFlowResult {
  authedHandle?: string;
  scopes: string[];
  hasRefresh: boolean;
  expiresInSec?: number;
}

// Interactive PKCE authorization-code flow. Prints the consent URL to stderr,
// waits for the user to paste the redirected URL (or bare code), exchanges it,
// persists the tokens, and verifies by resolving the authenticated handle.
// The browser step can't be automated, so this is built for a human in a TTY.
export async function runAuthFlow(): Promise<AuthFlowResult> {
  const oauth2 = buildOAuth2();
  const state = crypto.randomUUID();
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  oauth2.setPkceParameters(verifier, challenge);
  const url = await oauth2.getAuthorizationUrl(state);

  process.stderr.write(
    [
      "",
      "Authorize x to read your bookmarks:",
      "",
      "  1. Open this URL in a browser logged into your X account",
      "  2. Approve the requested scopes",
      `  3. Your browser will try to load ${getRedirectUri()} and fail to connect — that is expected`,
      "  4. Copy the FULL URL from the address bar (it contains ?code=...) and paste it below",
      "",
      url,
      "",
    ].join("\n"),
  );

  const pasted = (prompt("Paste redirect URL or code:") ?? "").trim();
  const parsed = parsePastedRedirect(pasted);
  if (parsed.state && parsed.state !== state) {
    throw new ProviderError(
      "OAuth state mismatch — aborting (possible CSRF or a stale paste from an earlier run).",
    );
  }
  if (!parsed.code) {
    throw new ProviderError(
      "Couldn't find an authorization code in what you pasted.",
      "Paste the whole redirected URL, including the ?code=... part.",
    );
  }

  let tok: OAuth2Token;
  try {
    tok = await oauth2.exchangeCode(parsed.code, verifier);
  } catch (err) {
    throw new ProviderError(
      `Token exchange failed: ${err instanceof Error ? err.message : String(err)}`,
      "Common causes: the redirect URI doesn't match the app's registered callback, the code was already used, or the app isn't a public/PKCE client.",
    );
  }
  persistTokenSet(tok);

  let authedHandle: string | undefined;
  try {
    const me = (await new Client({ accessToken: tok.access_token }).users.getMe()) as {
      data?: { username?: string };
    };
    authedHandle = me.data?.username;
  } catch {
    // non-fatal: tokens are stored; handle verification is just a nicety
  }

  return {
    authedHandle,
    scopes: OAUTH_SCOPES,
    hasRefresh: !!tok.refresh_token,
    expiresInSec: tok.expires_in,
  };
}

// Returns a valid user-context access token, transparently refreshing (and
// persisting the rotated set) when the stored one is expired/expiring. Throws a
// clear, actionable error when no auth has been set up yet.
export async function getValidUserAccessToken(): Promise<string> {
  const access = getUserToken();
  const expiresAt = getTokenExpiresAt();
  const fresh = access && (!expiresAt || Date.now() < expiresAt - 60_000);
  if (fresh) return access!;

  const refresh = getRefreshToken();
  const clientId = getClientId();
  if (refresh && clientId) {
    const oauth2 = buildOAuth2();
    try {
      const tok = await oauth2.refreshToken(refresh);
      persistTokenSet(tok);
      return tok.access_token;
    } catch (err) {
      if (access) return access; // refresh failed but we still have a token; let the API surface the real error
      throw new ProviderError(
        `Token refresh failed: ${err instanceof Error ? err.message : String(err)}`,
        "Re-run `x auth` to re-authorize.",
      );
    }
  }

  if (access) return access; // no refresh capability, but a (possibly expired) token exists
  throw new ProviderError(
    "Owned reads (mentions/bookmarks) need an OAuth2 user token.",
    "Run `x auth` to authorize (one-time browser step).",
  );
}

// Accepts a full redirect URL (http://127.0.0.1/callback?code=...&state=...), a
// bare query string (code=...&state=...), or just the code itself.
export function parsePastedRedirect(input: string): { code?: string; state?: string } {
  const s = input.trim();
  if (!s) return {};
  if (s.includes("code=")) {
    const qs = s.includes("?") ? s.slice(s.indexOf("?") + 1) : s;
    const params = new URLSearchParams(qs);
    return {
      code: params.get("code") ?? undefined,
      state: params.get("state") ?? undefined,
    };
  }
  if (!s.includes("=") && !s.includes("&") && !s.includes(" ")) return { code: s };
  return {};
}
