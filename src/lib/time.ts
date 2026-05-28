// Parse a --since value into an ISO-8601 UTC start time.
// Accepts relative (7d, 24h, 90m) or absolute (YYYY-MM-DD, full ISO) forms.
// Recent search only covers the last 7 days, so older values are clamped.

const MAX_LOOKBACK_MS = 7 * 24 * 3_600_000 - 60_000; // just under 7d to stay valid

export interface SinceResult {
  iso: string;
  clamped: boolean;
}

export function parseSince(value: string, now = Date.now()): SinceResult | null {
  const v = value.trim();
  const rel = v.match(/^(\d+)\s*([dhm])$/i);
  let target: number;
  if (rel) {
    const num = parseInt(rel[1] ?? "0", 10);
    const unit = (rel[2] ?? "d").toLowerCase();
    const ms = unit === "d" ? 86_400_000 : unit === "h" ? 3_600_000 : 60_000;
    target = now - num * ms;
  } else {
    const parsed = Date.parse(v);
    if (Number.isNaN(parsed)) return null;
    target = parsed;
  }
  const earliest = now - MAX_LOOKBACK_MS;
  const clamped = target < earliest;
  const finalT = clamped ? earliest : target;
  return { iso: new Date(finalT).toISOString(), clamped };
}
