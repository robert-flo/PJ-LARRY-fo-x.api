import { type ProviderName, type XProvider, type ProviderStatus, ProviderError } from "./types.ts";
import { OfficialProvider } from "./official.ts";
import { CookieProvider } from "./cookie.ts";

export type ProviderChoice = ProviderName | "auto";

const official = new OfficialProvider();
const cookie = new CookieProvider();

export function getProvider(name: ProviderName): XProvider {
  return name === "official" ? official : cookie;
}

export async function allStatuses(): Promise<ProviderStatus[]> {
  return Promise.all([official.status(), cookie.status()]);
}

// Resolve which provider to actually use. `auto` prefers the free cookie
// backbone for reads when twitter-cli is installed, else falls back to official.
export async function resolveProvider(choice: ProviderChoice): Promise<XProvider> {
  if (choice === "official") return ensureReady(official);
  if (choice === "cookie") return ensureReady(cookie);

  const cookieStatus = await cookie.status();
  if (cookieStatus.ready) return cookie;
  const officialStatus = await official.status();
  if (officialStatus.ready) return official;

  throw new ProviderError(
    "No usable provider.",
    "Set X_API_BEARER_TOKEN for the official API, or install twitter-cli for cookie reads.",
  );
}

async function ensureReady(p: XProvider): Promise<XProvider> {
  const s = await p.status();
  if (!s.ready) throw new ProviderError(`Provider '${p.name}' is not ready: ${s.detail}`);
  return p;
}
