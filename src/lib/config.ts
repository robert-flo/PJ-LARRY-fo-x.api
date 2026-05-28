// Credential resolution. CRITICAL: this module is the ONLY place that touches
// token values, and it NEVER returns or logs them except to hand a token
// straight into a provider client constructor. No command prints these.
// Follows the xurl SKILL.md rule: the calling AI must never see secrets.

export interface CredState {
  hasBearer: boolean;
  hasUserToken: boolean; // OAuth2 user-context access token (enables owned reads)
}

const BEARER_VARS = ["X_API_BEARER_TOKEN", "X_BEARER_TOKEN"];
const USER_TOKEN_VARS = ["X_API_ACCESS_TOKEN", "X_ACCESS_TOKEN"];

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

export const BEARER_ENV_HINT = BEARER_VARS[0];
export const USER_TOKEN_ENV_HINT = USER_TOKEN_VARS[0];
