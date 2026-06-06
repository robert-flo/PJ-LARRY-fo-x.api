import YAML from "yaml";
import type { CliOptions } from "../options.ts";
import { runAuthFlow } from "../lib/userauth.ts";

// `x auth` — one-time interactive OAuth2 authorization that unlocks owned reads
// (mentions/bookmarks). Stores access + refresh tokens in the wrapper's env
// file; never prints them. Requires X_API_CLIENT_ID to be set first.
export async function cmdAuth(opts: CliOptions): Promise<string> {
  const result = await runAuthFlow();

  const summary = {
    ok: true,
    authedAs: result.authedHandle ? `@${result.authedHandle}` : "(handle unverified)",
    scopes: result.scopes,
    autoRefresh: result.hasRefresh,
    accessTokenTtlSec: result.expiresInSec,
    note: result.hasRefresh
      ? "Tokens stored; access token auto-refreshes. `x bookmarks` is live."
      : "Access token stored but NO refresh token returned — re-auth when it expires (check the offline.access scope).",
  };

  if (opts.mode === "yaml") return YAML.stringify(summary);
  if (opts.mode === "compact" || opts.mode === "md") {
    return [
      `✓ Authorized as ${summary.authedAs}`,
      `  scopes: ${result.scopes.join(" ")}`,
      `  auto-refresh: ${result.hasRefresh ? "on" : "OFF (no offline.access)"}`,
      `  try: x bookmarks --compact`,
    ].join("\n");
  }
  return JSON.stringify(summary, null, 2);
}
