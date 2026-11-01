import { describe, expect, it } from "vitest";
import { GENESIS_HASH, buildPayload, hashEntry, verifyChain } from "./audit";
import type { StoredAudit } from "./types";

function chain(n: number): { entries: StoredAudit[]; head: { count: number; hash: string } } {
  const entries: StoredAudit[] = [];
  let prev = GENESIS_HASH;
  for (let i = 1; i <= n; i++) {
    const payload = buildPayload(
      { actorId: "u1", actorRole: "client", action: `action.${i}`, targetType: "contract", targetId: "c1", result: "ok" },
      new Date(`2026-10-01T09:0${i}:00Z`),
    );
    const hash = hashEntry(prev, payload);
    entries.push({ seq: i, payload, prevHash: prev, hash });
    prev = hash;
  }
  return { entries, head: { count: n, hash: prev } };
}

describe("audit hash chain", () => {
  it("verifies an untouched chain and an empty one [FR-8.2, FR-8.4]", () => {
    const { entries, head } = chain(5);
    expect(verifyChain(entries, head)).toEqual({ ok: true, count: 5, head: head.hash });
    expect(verifyChain([], { count: 0, hash: GENESIS_HASH }).ok).toBe(true);
  });

  it("reports the exact entry whose content was edited [FR-8.2, FR-8.4]", () => {
    const { entries, head } = chain(5);
    entries[2] = { ...entries[2], payload: entries[2].payload.replace("action.3", "action.X") };
    const result = verifyChain(entries, head);
    expect(result).toMatchObject({ ok: false, brokenAt: 3 });
  });

  it("detects a deleted middle entry [FR-8.4]", () => {
    const { entries, head } = chain(5);
    const result = verifyChain(entries.filter((e) => e.seq !== 3), head);
    expect(result.ok).toBe(false);
  });

  it("detects a deleted last entry by comparing with the stored head [FR-8.4]", () => {
    const { entries, head } = chain(5);
    expect(verifyChain(entries.slice(0, 4), head).ok).toBe(false);
  });

  it("never writes secrets into the log [FR-8.6, FR-1.5]", () => {
    const payload = buildPayload(
      { actorId: "u1", actorRole: "client", action: "x", targetType: "t", targetId: "1", result: "ok", after: { password: "hunter2", nested: { apiKey: "k", ok: 1 } } },
      new Date(),
    );
    expect(payload).not.toContain("hunter2");
    expect(payload).toContain("[redacted]");
    expect(payload).toContain('"ok":1');
  });
});
