import { describe, expect, it } from "vitest";
import { AUTH, GENERAL, RateLimiter, limitsFor, readEnvLimit } from "./rate-limit";

const req = (over = {}) => ({ path: "/dashboard", method: "GET", ip: "1.1.1.1", userKey: "u_amina", prefetch: false, ...over });

describe("rate limiting [NFR-1.6]", () => {
  it("allows 100 requests a minute per user, blocks the 101st, and resets after the window", () => {
    const rl = new RateLimiter();
    for (let i = 0; i < 100; i++) expect(rl.check("u_amina", GENERAL, 1000).allowed).toBe(true);
    const blocked = rl.check("u_amina", GENERAL, 1000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(rl.check("u_brian", GENERAL, 1000).allowed).toBe(true);
    expect(rl.check("u_amina", GENERAL, 1000 + 60_001).allowed).toBe(true);
  });

  it("is much stricter on sign-in and sign-up, keyed by address", () => {
    const rl = new RateLimiter();
    const results = Array.from({ length: 12 }, () => rl.check("ip:9.9.9.9", AUTH, 5));
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
    expect(rl.check("ip:8.8.8.8", AUTH, 5).allowed).toBe(true);
  });

  it("picks limits by path, ignores prefetches and the health check, and keys by user before address", () => {
    expect(limitsFor(req()).map((l) => [l.limit.name, l.key])).toEqual([["general", "u_amina"]]);
    expect(limitsFor(req({ userKey: null }))[0].key).toBe("ip:1.1.1.1");
    expect(limitsFor(req({ path: "/sign-in" })).map((l) => l.limit.name)).toEqual(["general", "auth"]);
    expect(limitsFor(req({ path: "/sign-up/verify" })).map((l) => l.limit.name)).toContain("auth");
    expect(limitsFor(req({ prefetch: true }))).toEqual([]);
    expect(limitsFor(req({ path: "/api/health" }))).toEqual([]);
    expect(limitsFor(req(), { general: 5 })[0].limit.max).toBe(5);
  });

  it("reads limits from the environment only when they are positive whole numbers", () => {
    expect(readEnvLimit("30")).toBe(30);
    expect(readEnvLimit("0")).toBeUndefined();
    expect(readEnvLimit("abc")).toBeUndefined();
    expect(readEnvLimit(undefined)).toBeUndefined();
  });

  it("does not let the counter map grow without bound", () => {
    const rl = new RateLimiter();
    for (let i = 0; i < 5100; i++) rl.check(`k${i}`, GENERAL, 0);
    rl.check("fresh", GENERAL, 120_000);
    expect(rl.check("k1", GENERAL, 120_000).remaining).toBe(99);
  });
});
