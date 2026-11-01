import { describe, expect, it } from "vitest";
import { GENESIS_HASH, buildPayload, hashEntry, verifyChain } from "./audit";
import { deliveredContract, setup } from "@/test/helpers";
import type { StoredAudit } from "./types";

describe("performance targets", () => {
  it("verifies a chain of 100,000 audit entries well inside 60 seconds [NFR-3.4]", () => {
    const entries: StoredAudit[] = [];
    let prev = GENESIS_HASH;
    const at = new Date("2026-10-01T09:00:00Z");
    for (let i = 1; i <= 100_000; i++) {
      const payload = buildPayload({ actorId: "u1", actorRole: "client", action: "contract.fund", targetType: "contract", targetId: `c${i}`, result: "ok", after: { state: "funded" } }, at);
      const hash = hashEntry(prev, payload);
      entries.push({ seq: i, payload, prevHash: prev, hash });
      prev = hash;
    }
    const started = performance.now();
    const result = verifyChain(entries, { count: entries.length, hash: prev });
    const seconds = (performance.now() - started) / 1000;
    expect(result.ok).toBe(true);
    expect(seconds).toBeLessThan(60);
    console.info(`Verified 100,000 audit entries in ${seconds.toFixed(2)} s (target: under 60 s)`);
  });

  it("finds a single altered entry at the end of a 100,000-entry chain [NFR-3.4, FR-8.4]", () => {
    const entries: StoredAudit[] = [];
    let prev = GENESIS_HASH;
    const at = new Date("2026-10-01T09:00:00Z");
    for (let i = 1; i <= 100_000; i++) {
      const payload = buildPayload({ actorId: null, actorRole: "system", action: "x", targetType: "t", targetId: String(i), result: "ok" }, at);
      const hash = hashEntry(prev, payload);
      entries.push({ seq: i, payload, prevHash: prev, hash });
      prev = hash;
    }
    entries[99_998] = { ...entries[99_998], payload: entries[99_998].payload.replace('"ok"', '"rejected"') };
    const result = verifyChain(entries, { count: entries.length, hash: prev });
    expect(result).toMatchObject({ ok: false, brokenAt: 99_999 });
  });

  it("a release completes in well under 2 seconds including ledger and audit writes [NFR-3.3]", async () => {
    const ctx = await setup();
    const c = await deliveredContract(ctx);
    const started = performance.now();
    await ctx.svc.approve(ctx.amina, c.id, "approve-key-0001");
    const ms = performance.now() - started;
    expect(ms).toBeLessThan(2000);
    console.info(`Release took ${ms.toFixed(1)} ms in memory (target: under 2000 ms)`);
  });
});
