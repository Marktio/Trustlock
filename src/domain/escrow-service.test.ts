import { beforeEach, describe, expect, it } from "vitest";
import { DomainError } from "./errors";
import { parseAudit } from "./audit";
import { acceptedContract, deliveredContract, goodFile, sc, setup, validContract } from "@/test/helpers";

let ctx: Awaited<ReturnType<typeof setup>>;
beforeEach(async () => {
  ctx = await setup();
});

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "no error";
  } catch (e) {
    return e instanceof DomainError ? e.code : `unexpected: ${(e as Error).message}`;
  }
};

describe("creating contracts", () => {
  it("creates a proposed contract with a 7 day expiry and a two-entry audit trail [FR-3.1, FR-3.8, FR-8.1]", async () => {
    const c = await ctx.svc.createContract(ctx.amina, validContract());
    expect(c.state).toBe("proposed");
    expect(c.amount).toBe(sc(45_000));
    expect(c.ref).toMatch(/^TL-2026-\d{4}$/);
    expect(c.expiresAt).toBe("2026-10-08T09:00:00.000Z");
    const actions = (await ctx.repo.listAudit()).map(parseAudit).map((a) => a.action);
    expect(actions).toEqual(["contract.created", "contract.proposed"]);
  });

  it("files the creation audit entries under the new contract's id so they show on its timeline [FR-3.9]", async () => {
    const c = await ctx.svc.createContract(ctx.amina, validContract());
    const entries = (await ctx.repo.listAudit()).map(parseAudit);
    expect(entries.every((e) => e.targetId === c.id)).toBe(true);
    const view = await ctx.svc.getContractView(ctx.amina, c.id);
    expect(view.timeline.map((e) => e.action)).toEqual(["contract.created", "contract.proposed"]);
  });

  it("rejects invalid input with a message that says what to fix [FR-3.12, NFR-1.3, NFR-5.5]", async () => {
    expect(await code(ctx.svc.createContract(ctx.amina, validContract({ title: "" })))).toBe("VALIDATION");
    expect(await code(ctx.svc.createContract(ctx.amina, validContract({ totalSC: "abc" })))).toBe("VALIDATION");
    expect(await code(ctx.svc.createContract(ctx.amina, validContract({ freelancerEmail: "nobody@example.com" })))).toBe("VALIDATION");
    expect(await code(ctx.svc.createContract(ctx.amina, validContract({ freelancerEmail: "amina@example.com" })))).toBe("VALIDATION");
    expect(await code(ctx.svc.createContract(ctx.amina, validContract({ reviewPeriodDays: 40 })))).toBe("VALIDATION");
  });

  it("explains how far milestones are from the total [FR-3.2, NFR-5.5]", async () => {
    await expect(ctx.svc.createContract(ctx.amina, validContract({ totalSC: "46000" }))).rejects.toThrow(/Add KSh 1,000/);
    await expect(ctx.svc.createContract(ctx.amina, validContract({ totalSC: "44000" }))).rejects.toThrow(/KSh 1,000 over/);
  });

  it("rejects milestones due in the past [FR-3.2]", async () => {
    const past = validContract({ milestones: [{ title: "Old", dueDate: "2026-09-01", amountSC: "45000" }] });
    await expect(ctx.svc.createContract(ctx.amina, past)).rejects.toThrow(/due in the past/);
  });

  it("only clients can create contracts [FR-1.12]", async () => {
    expect(await code(ctx.svc.createContract(ctx.brian, validContract()))).toBe("FORBIDDEN");
  });
});

describe("funding", () => {
  it("moves the amount from Available to Held and keeps the ledger balanced [FR-4.1, FR-4.3, FR-2.5, NFR-2.3]", async () => {
    const c = await acceptedContract(ctx);
    const before = await ctx.repo.getBalances(ctx.amina.id);
    const funded = await ctx.svc.fund(ctx.amina, c.id, "fund-key-0001");
    const after = await ctx.repo.getBalances(ctx.amina.id);
    expect(funded.state).toBe("funded");
    expect(after.available).toBe(before.available - sc(45_000));
    expect(after.held).toBe(sc(45_000));
    expect((await ctx.svc.reconcile(ctx.daniel)).balanced).toBe(true);
  });

  it("rejects funding when the balance is one credit short and changes nothing [FR-4.2, FR-2.6, NFR-2.2]", async () => {
    await ctx.svc.topUp(ctx.amina, sc(44_999), "topup-short-01");
    const c = await ctx.svc.accept(ctx.brian, (await ctx.svc.createContract(ctx.amina, validContract())).id);
    await expect(ctx.svc.fund(ctx.amina, c.id, "fund-short-01")).rejects.toThrow(/Top up KSh 1/);
    expect((await ctx.repo.getContract(c.id))?.state).toBe("accepted");
    expect(await ctx.repo.getBalances(ctx.amina.id)).toEqual({ available: sc(44_999), held: 0 });
  });

  it("funds when the balance equals the amount exactly, leaving zero [FR-2.6]", async () => {
    await ctx.svc.topUp(ctx.amina, sc(45_000), "topup-exact-01");
    const c = await ctx.svc.accept(ctx.brian, (await ctx.svc.createContract(ctx.amina, validContract())).id);
    expect((await ctx.svc.fund(ctx.amina, c.id, "fund-exact-01")).state).toBe("funded");
    expect(await ctx.repo.getBalances(ctx.amina.id)).toEqual({ available: 0, held: sc(45_000) });
  });

  it("with zero balance funding fails and changes nothing [FR-4.2, FR-2.6]", async () => {
    const c = await ctx.svc.accept(ctx.brian, (await ctx.svc.createContract(ctx.amina, validContract())).id);
    expect(await code(ctx.svc.fund(ctx.amina, c.id, "fund-zero-01"))).toBe("INSUFFICIENT_FUNDS");
    expect(await ctx.repo.getBalances(ctx.amina.id)).toEqual({ available: 0, held: 0 });
  });

  it("repeating a request with the same key returns the original result and moves no more money [FR-2.7]", async () => {
    const c = await acceptedContract(ctx);
    await ctx.svc.fund(ctx.amina, c.id, "same-key-0001");
    const again = await ctx.svc.fund(ctx.amina, c.id, "same-key-0001");
    expect(again.state).toBe("funded");
    expect((await ctx.repo.getBalances(ctx.amina.id)).held).toBe(sc(45_000));
  });

  it("a second funding attempt with a new key is refused and audited [FR-4.2, FR-3.6]", async () => {
    const c = await acceptedContract(ctx);
    await ctx.svc.fund(ctx.amina, c.id, "fund-key-0001");
    expect(await code(ctx.svc.fund(ctx.amina, c.id, "fund-key-0002"))).toBe("ILLEGAL_TRANSITION");
    expect((await ctx.repo.getBalances(ctx.amina.id)).held).toBe(sc(45_000));
    const rejected = (await ctx.repo.listAudit()).map(parseAudit).filter((a) => a.result === "rejected");
    expect(rejected.map((a) => a.action)).toContain("contract.fund");
  });

  it("two simultaneous funding requests fund once [FR-4.5, NFR-2.4]", async () => {
    const c = await acceptedContract(ctx);
    const results = await Promise.allSettled([
      ctx.svc.fund(ctx.amina, c.id, "race-fund-001"),
      ctx.svc.fund(ctx.amina, c.id, "race-fund-002"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await ctx.repo.getBalances(ctx.amina.id)).held).toBe(sc(45_000));
  });

  it("requires an idempotency key [FR-2.7]", async () => {
    const c = await acceptedContract(ctx);
    expect(await code(ctx.svc.fund(ctx.amina, c.id, undefined))).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("only the client of the contract can fund it [FR-1.12, NFR-1.5]", async () => {
    const c = await acceptedContract(ctx);
    expect(await code(ctx.svc.fund(ctx.brian, c.id, "fund-by-freelancer"))).toBe("ILLEGAL_TRANSITION");
  });
});

describe("delivery, revision and release", () => {
  it("pays the freelancer the amount minus the 2% fee and completes the contract [FR-5.8, FR-4.6]", async () => {
    const c = await deliveredContract(ctx);
    const done = await ctx.svc.approve(ctx.amina, c.id, "approve-key-001");
    expect(done.state).toBe("completed");
    expect((await ctx.repo.getBalances(ctx.brian.id)).available).toBe(sc(44_100));
    expect((await ctx.repo.getBalances(ctx.amina.id)).held).toBe(0);
    const rec = await ctx.svc.reconcile(ctx.faith);
    expect(rec).toMatchObject({ balanced: true, fees: sc(900), issued: sc(150_000) });
  });

  it("two release requests at the same instant produce exactly one payout [FR-5.9, NFR-2.4]", async () => {
    const c = await deliveredContract(ctx);
    const results = await Promise.allSettled([
      ctx.svc.approve(ctx.amina, c.id, "approve-race-01"),
      ctx.svc.approve(ctx.amina, c.id, "approve-race-02"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await ctx.repo.getBalances(ctx.brian.id)).available).toBe(sc(44_100));
  });

  it("repeating the release request with the same key is a no-op [FR-5.9, FR-2.7]", async () => {
    const c = await deliveredContract(ctx);
    await ctx.svc.approve(ctx.amina, c.id, "approve-same-01");
    await ctx.svc.approve(ctx.amina, c.id, "approve-same-01");
    expect((await ctx.repo.getBalances(ctx.brian.id)).available).toBe(sc(44_100));
  });

  it("the freelancer cannot approve their own delivery and the client cannot deliver [FR-1.12, FR-5.5]", async () => {
    const c = await deliveredContract(ctx);
    expect(await code(ctx.svc.approve(ctx.brian, c.id, "approve-by-free"))).toBe("ILLEGAL_TRANSITION");
    expect(await code(ctx.svc.deliver(ctx.amina, c.id, goodFile))).toBe("ILLEGAL_TRANSITION");
    expect((await ctx.repo.getContract(c.id))?.state).toBe("delivered");
  });

  it("cannot release an undelivered contract [FR-3.6, FR-5.5]", async () => {
    const c = await acceptedContract(ctx);
    await ctx.svc.fund(ctx.amina, c.id, "fund-key-0001");
    expect(await code(ctx.svc.approve(ctx.amina, c.id, "approve-early-01"))).toBe("ILLEGAL_TRANSITION");
    expect((await ctx.repo.getBalances(ctx.brian.id)).available).toBe(0);
  });

  it("a revision returns the contract to in progress and stops at the limit [FR-5.4, FR-5.6]", async () => {
    let c = await deliveredContract(ctx);
    for (let i = 1; i <= 2; i++) {
      c = await ctx.svc.requestRevision(ctx.amina, c.id, "Please adjust the colours.");
      expect(c.state).toBe("in_progress");
      expect(c.revisionsUsed).toBe(i);
      c = await ctx.svc.deliver(ctx.brian, c.id, goodFile);
    }
    expect(await code(ctx.svc.requestRevision(ctx.amina, c.id, "One more change."))).toBe("LIMIT");
    const view = await ctx.svc.getContractView(ctx.amina, c.id);
    expect(view.actions).not.toContain("request_revision");
    expect(view.actions).toContain("approve");
  });

  it("validates uploads: type, size, empty files and path tricks [FR-5.1, NFR-1.3]", async () => {
    const c = await ctx.svc.accept(ctx.brian, (await ctx.svc.createContract(ctx.amina, validContract())).id);
    await ctx.svc.topUp(ctx.amina, sc(100_000), "topup-up-0001");
    await ctx.svc.topUp(ctx.amina, sc(50_000), "topup-up-0002");
    await ctx.svc.fund(ctx.amina, c.id, "fund-up-00001");
    await ctx.svc.startWork(ctx.brian, c.id);
    for (const bad of [
      { ...goodFile, fileName: "run.exe" },
      { ...goodFile, fileName: "../../etc/passwd.txt" },
      { ...goodFile, sizeBytes: 0 },
      { ...goodFile, sizeBytes: 26 * 1024 * 1024 },
      { ...goodFile, sha256: "xyz" },
    ]) {
      expect(await code(ctx.svc.deliver(ctx.brian, c.id, bad))).toBe("VALIDATION");
    }
    expect((await ctx.repo.getContract(c.id))?.state).toBe("in_progress");
  });

  it("records a SHA-256 fingerprint and a review deadline on delivery [FR-5.2, FR-5.3]", async () => {
    const c = await deliveredContract(ctx);
    expect(c.deliverable?.sha256).toBe("a".repeat(64));
    expect(c.reviewEndsAt).toBe("2026-10-04T09:00:00.000Z");
  });
});

describe("scheduler", () => {
  it("auto-approves after the review period and pays once, even if it runs twice [FR-5.7, FR-5.9, NFR-2.5, NFR-4.3]", async () => {
    const c = await deliveredContract(ctx);
    ctx.clock.advanceDays(2);
    expect(await ctx.svc.runScheduler()).toMatchObject({ released: 0 });
    ctx.clock.advanceDays(2);
    expect(await ctx.svc.runScheduler()).toMatchObject({ released: 1 });
    expect(await ctx.svc.runScheduler()).toMatchObject({ released: 0 });
    expect((await ctx.repo.getContract(c.id))?.state).toBe("completed");
    expect((await ctx.repo.getBalances(ctx.brian.id)).available).toBe(sc(44_100));
  });

  it("expires proposals 7 days after they are sent and unfunded contracts 7 days after they are accepted [FR-3.8, FR-4.7, NFR-2.5]", async () => {
    const proposed = await ctx.svc.createContract(ctx.amina, validContract());
    const other = await ctx.svc.createContract(ctx.amina, validContract());
    ctx.clock.advanceDays(5);
    const accepted = await ctx.svc.accept(ctx.brian, other.id);
    ctx.clock.advanceDays(3); // day 8
    expect(await ctx.svc.runScheduler()).toMatchObject({ expired: 1 });
    expect((await ctx.repo.getContract(proposed.id))?.state).toBe("expired");
    expect((await ctx.repo.getContract(accepted.id))?.state).toBe("accepted");
    ctx.clock.advanceDays(5); // day 13, past the funding deadline of day 12
    expect(await ctx.svc.runScheduler()).toMatchObject({ expired: 1 });
    expect((await ctx.repo.getContract(accepted.id))?.state).toBe("expired");
  });

  it("does not expire a contract that was funded in time [FR-4.7]", async () => {
    const c = await acceptedContract(ctx);
    await ctx.svc.fund(ctx.amina, c.id, "fund-key-0001");
    ctx.clock.advanceDays(30);
    expect(await ctx.svc.runScheduler()).toEqual({ released: 0, expired: 0, skipped: 0 });
    expect((await ctx.repo.getContract(c.id))?.state).toBe("funded");
  });
});

describe("access control", () => {
  it("hides contracts from people who are not a party, with the same error as a missing contract [FR-3.10, NFR-1.5]", async () => {
    const c = await acceptedContract(ctx);
    expect(await code(ctx.svc.getContractView(ctx.sheila, c.id))).toBe("NOT_FOUND");
    expect(await code(ctx.svc.getContractView(ctx.sheila, "does-not-exist"))).toBe("NOT_FOUND");
    expect(await code(ctx.svc.fund(ctx.sheila, c.id, "fund-by-other-1"))).toBe("NOT_FOUND");
    expect(await ctx.svc.listContracts(ctx.sheila)).toHaveLength(0);
  });

  it("only auditors and admins can verify the audit chain or reconcile [FR-1.12, FR-8.4]", async () => {
    expect(await code(ctx.svc.verifyAuditChain(ctx.amina))).toBe("FORBIDDEN");
    expect(await code(ctx.svc.reconcile(ctx.brian))).toBe("FORBIDDEN");
    expect((await ctx.svc.verifyAuditChain(ctx.faith)).ok).toBe(true);
  });
});

describe("wallet", () => {
  it("enforces top-up limits and the daily cap [FR-2.2]", async () => {
    expect(await code(ctx.svc.topUp(ctx.amina, sc(5), "topup-low-0001"))).toBe("LIMIT");
    expect(await code(ctx.svc.topUp(ctx.amina, sc(100_001), "topup-high-001"))).toBe("LIMIT");
    for (let i = 0; i < 5; i++) await ctx.svc.topUp(ctx.amina, sc(100_000), `topup-day-000${i}`);
    expect(await code(ctx.svc.topUp(ctx.amina, sc(10), "topup-day-0099"))).toBe("LIMIT");
    ctx.clock.advanceDays(1.1);
    await ctx.svc.topUp(ctx.amina, sc(10), "topup-day-0100");
  });

  it("leaves the wallet unchanged when the simulated gateway fails [FR-2.2, FR-2.9, NFR-6.5]", async () => {
    ctx.gateway.mode = "fail";
    expect(await code(ctx.svc.topUp(ctx.amina, sc(1000), "topup-fail-001"))).toBe("GATEWAY_FAILED");
    ctx.gateway.mode = "timeout";
    expect(await code(ctx.svc.topUp(ctx.amina, sc(1000), "topup-fail-002"))).toBe("GATEWAY_FAILED");
    expect(await ctx.repo.getBalances(ctx.amina.id)).toEqual({ available: 0, held: 0 });
  });

  it("a retried top-up with the same key credits once [FR-2.7]", async () => {
    await ctx.svc.topUp(ctx.amina, sc(1000), "topup-same-001");
    await ctx.svc.topUp(ctx.amina, sc(1000), "topup-same-001");
    expect((await ctx.repo.getBalances(ctx.amina.id)).available).toBe(sc(1000));
  });

  it("lets a freelancer withdraw earnings but never more than they have [FR-2.4, FR-2.6]", async () => {
    const c = await deliveredContract(ctx);
    await ctx.svc.approve(ctx.amina, c.id, "approve-key-001");
    expect(await code(ctx.svc.withdraw(ctx.brian, sc(50_000), "withdraw-big-01"))).toBe("INSUFFICIENT_FUNDS");
    await ctx.svc.withdraw(ctx.brian, sc(10_000), "withdraw-ok-001");
    expect((await ctx.repo.getBalances(ctx.brian.id)).available).toBe(sc(34_100));
    expect((await ctx.svc.reconcile(ctx.daniel)).balanced).toBe(true);
  });
});

describe("audit log", () => {
  it("stays verifiable after a full contract lifecycle and names the entry that was tampered with [FR-8.1, FR-8.2, FR-8.4]", async () => {
    const c = await deliveredContract(ctx);
    await ctx.svc.approve(ctx.amina, c.id, "approve-key-001");
    expect((await ctx.svc.verifyAuditChain(ctx.faith)).ok).toBe(true);
    ctx.repo.tamperAudit(4, (await ctx.repo.listAudit())[3].payload.replace("ok", "no"));
    const result = await ctx.svc.verifyAuditChain(ctx.faith);
    expect(result).toMatchObject({ ok: false, brokenAt: 4 });
  });

  it("detects a deleted entry [FR-8.4]", async () => {
    await deliveredContract(ctx);
    ctx.repo.deleteAudit(2);
    expect((await ctx.svc.verifyAuditChain(ctx.faith)).ok).toBe(false);
  });
});
