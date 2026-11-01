/**
 * A fixed-window rate limiter (NFR-1.6): 100 requests a minute per user, and a much stricter limit on sign-in and sign-up.
 * Counts live in memory, so each server instance counts for itself. That is enough to stop a script hammering one instance,
 * but a deployment with many instances needs a shared store such as Redis (noted in the README).
 */

export interface Limit {
  /** Name used in the counter key, so separate limits never share a count. */
  name: string;
  max: number;
  windowMs: number;
}

export interface Decision {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets. */
  retryAfter: number;
}

export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  check(key: string, limit: Limit, now: number): Decision {
    const id = `${limit.name}:${key}`;
    let h = this.hits.get(id);
    if (!h || h.resetAt <= now) {
      h = { count: 0, resetAt: now + limit.windowMs };
      this.hits.set(id, h);
      this.sweep(now);
    }
    h.count += 1;
    return { allowed: h.count <= limit.max, remaining: Math.max(0, limit.max - h.count), retryAfter: Math.max(1, Math.ceil((h.resetAt - now) / 1000)) };
  }

  /** Drops finished windows so the map cannot grow forever. */
  private sweep(now: number) {
    if (this.hits.size < 5000) return;
    for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
  }
}

export const GENERAL: Limit = { name: "general", max: 100, windowMs: 60_000 };
export const AUTH: Limit = { name: "auth", max: 10, windowMs: 60_000 };

const AUTH_PATHS = /^\/(sign-in|sign-up)(\/|$)/;

export interface RequestInfo {
  path: string;
  method: string;
  ip: string;
  /** A stable id for the signed-in user, if the request carries one. */
  userKey: string | null;
  prefetch: boolean;
}

/** Which limits apply to this request, and under which key. Prefetches and the health check are not counted. */
export function limitsFor(r: RequestInfo, env: { general?: number; auth?: number } = {}): { limit: Limit; key: string }[] {
  if (r.prefetch || r.path === "/api/health") return [];
  const out: { limit: Limit; key: string }[] = [{ limit: { ...GENERAL, max: env.general ?? GENERAL.max }, key: r.userKey ?? `ip:${r.ip}` }];
  if (AUTH_PATHS.test(r.path)) out.push({ limit: { ...AUTH, max: env.auth ?? AUTH.max }, key: `ip:${r.ip}` });
  return out;
}

export function readEnvLimit(v: string | undefined): number | undefined {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}
