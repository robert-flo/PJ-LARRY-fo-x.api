// Credential resolution. CRITICAL: this module is the ONLY place that touches
// token values, and it NEVER returns or logs them except to hand a token
// straight into a provider client constructor (reads) or write it to the
// 0600 secret file (the OAuth2 auth/refresh flow). No command prints these.
// Follows the xurl SKILL.md rule: the calling AI must never see secrets.

import { readFileSync, writeFileSync, chmodSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

export interface CredState {
  hasBearer: boolean;
  hasUserToken: boolean; // OAuth2 user-context access token (enables owned reads)
  hasClientId: boolean; // OAuth2 client id (enables `x auth` + auto-refresh)
  hasRefreshToken: boolean; // enables silent renewal past the ~2h access-token expiry
}

const BEARER_VARS = ["X_API_BEARER_TOKEN", "X_BEARER_TOKEN"];
const USER_TOKEN_VARS = ["X_API_ACCESS_TOKEN", "X_ACCESS_TOKEN"];
const REFRESH_TOKEN_VARS = ["X_API_REFRESH_TOKEN"];
const EXPIRES_VARS = ["X_API_TOKEN_EXPIRES_AT"]; // epoch milliseconds
const CLIENT_ID_VARS = ["X_API_CLIENT_ID"];
const CLIENT_SECRET_VARS = ["X_API_CLIENT_SECRET"]; // optional (public clients omit it)
const REDIRECT_VARS = ["X_API_REDIRECT_URI"];

// The wrapper (~/bin/x) sources this file before exec'ing the CLI, so writes
// here take effect on the NEXT invocation. The current process uses freshly
// minted tokens directly, so it never needs a re-read.
export const ENV_FILE = `${process.env.HOME ?? ""}/.config/x-api/env`;

const DEFAULT_REDIRECT_URI = "http://127.0.0.1/callback";

function firstEnv(names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

// Returns presence flags only — safe to log / show in `x status`.
export function credState(): CredState {
  return {
    hasBearer: firstEnv(BEARER_VARS) !== undefined,
    hasUserToken: firstEnv(USER_TOKEN_VARS) !== undefined,
    hasClientId: firstEnv(CLIENT_ID_VARS) !== undefined,
    hasRefreshToken: firstEnv(REFRESH_TOKEN_VARS) !== undefined,
  };
}

// Returns the actual secret. Callers MUST pass it directly into a client
// constructor and never echo it. Intentionally not exported for general use.
export function getBearer(): string | undefined {
  return firstEnv(BEARER_VARS);
}

export function getUserToken(): string | undefined {
  return firstEnv(USER_TOKEN_VARS);
}

export function getRefreshToken(): string | undefined {
  return firstEnv(REFRESH_TOKEN_VARS);
}

export function getClientId(): string | undefined {
  return firstEnv(CLIENT_ID_VARS);
}

export function getClientSecret(): string | undefined {
  return firstEnv(CLIENT_SECRET_VARS);
}

export function getRedirectUri(): string {
  return firstEnv(REDIRECT_VARS) ?? DEFAULT_REDIRECT_URI;
}

// Epoch ms when the current access token expires, or undefined if unknown.
export function getTokenExpiresAt(): number | undefined {
  const raw = firstEnv(EXPIRES_VARS);
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

// Persist secret/config key-value pairs into the 0600 env file the wrapper
// sources. Preserves existing keys, comments, and ordering; updates in place
// or appends. NEVER logs values. Single-quotes values so bash `source` is safe.
export function persistSecrets(updates: Record<string, string>): void {
  const dir = dirname(ENV_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });

  const existing = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  const lines = existing.length ? existing.split("\n") : [];
  const remaining = new Map(Object.entries(updates));

  const out = lines.map((line) => {
    const m = line.match(/^(export\s+)?([A-Za-z_][A-Za-z0-9_]*)=/);
    const key = m?.[2];
    if (key !== undefined && remaining.has(key)) {
      const val = remaining.get(key)!;
      remaining.delete(key);
      return `${m?.[1] ?? ""}${key}=${quote(val)}`;
    }
    return line;
  });

  for (const [key, val] of remaining) {
    out.push(`${key}=${quote(val)}`);
  }

  // Collapse any trailing blank lines into a single terminating newline.
  let text = out.join("\n").replace(/\n+$/, "");
  text += "\n";

  writeFileSync(ENV_FILE, text, { mode: 0o600 });
  chmodSync(ENV_FILE, 0o600);
}

// Single-quote for bash `source`. X tokens are base64url ([A-Za-z0-9._~-]) so
// they never contain a quote, but we defend anyway by escaping single quotes.
function quote(v: string): string {
  return `'${v.replace(/'/g, "'\\''")}'`;
}

export const BEARER_ENV_HINT = BEARER_VARS[0]!;
export const USER_TOKEN_ENV_HINT = USER_TOKEN_VARS[0]!;
export const CLIENT_ID_ENV_HINT = CLIENT_ID_VARS[0]!;
export const ACCESS_TOKEN_KEY = USER_TOKEN_VARS[0]!;
export const REFRESH_TOKEN_KEY = REFRESH_TOKEN_VARS[0]!;
export const EXPIRES_KEY = EXPIRES_VARS[0]!;
