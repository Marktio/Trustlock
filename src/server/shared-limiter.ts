import { RateLimiter, type Limit } from "./rate-limit";

/**
 * Request counting for the developer API. Counts live in Upstash Redis when UPSTASH_REDIS_REST_URL and
 * UPSTASH_REDIS_REST_TOKEN are set, so every server instance shares one count (on Vercel each request may run on a different instance).
 * Without them, or when Redis is slow or down, it counts in this instance's memory instead: limits get looser, never absent.
 */
export type Decision = ReturnType<RateLimiter["check"]>;

const local = new RateLimiter();
const REDIS_TIMEOUT_MS = 1500;

export const sharedLimiterConfigured = () => Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

async function viaRedis(key: string, limit: Limit, fetcher: typeof fetch): Promise<Decision> {
  const base = process.env.UPSTASH_REDIS_REST_URL!.replace(/\/+$/, "");
  const id = `tl:rl:${limit.name}:${key}`;
  // INCR counts the request. PEXPIRE ... NX starts the window only on the first one. PTTL says how long until it resets.
  const res = await fetcher(`${base}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify([["INCR", id], ["PEXPIRE", id, limit.windowMs, "NX"], ["PTTL", id]]),
    signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Upstash answered ${res.status}`);
  const out = (await res.json()) as { result?: number; error?: string }[];
  if (!Array.isArray(out) || out[0]?.error || typeof out[0]?.result !== "number") throw new Error("Unexpected Upstash reply");
  const count = out[0].result;
  const ttl = typeof out[2]?.result === "number" && out[2].result > 0 ? out[2].result : limit.windowMs;
  return { allowed: count <= limit.max, remaining: Math.max(0, limit.max - count), retryAfter: Math.max(1, Math.ceil(ttl / 1000)) };
}

export async function checkLimit(key: string, limit: Limit, fetcher: typeof fetch = fetch): Promise<Decision> {
  if (sharedLimiterConfigured()) {
    try {
      return await viaRedis(key, limit, fetcher);
    } catch (e) {
      console.warn("[api/v1] shared limiter unavailable, counting locally:", e instanceof Error ? e.message : e);
    }
  }
  return local.check(key, limit, Date.now());
}
