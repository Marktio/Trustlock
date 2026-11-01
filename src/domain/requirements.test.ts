import { beforeEach, describe, expect, it } from "vitest";
import { parseAudit } from "./audit";
import { DomainError } from "./errors";
import { acceptedContract, deliveredContract, sc, setup, validContract } from "@/test/helpers";

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

describe("frozen and held funds", () => {
  it("a disputed contract cannot be approved, cancelled or revised, so nothing can release the money [FR-6.2, FR-4.4, FR-5.5]", async () => {
    const c = await deliveredContract(ctx);
    await ctx.svc.raiseDispute(ctx.amina, c.id, "Wrong file");
    expect(await code(ctx.svc.approve(ctx.amina, c.id, "approve-key-0001"))).toBe("ILLEGAL_TRANSITION");
    expect(await code(ctx.svc.cancel(ctx.amina, c.id))).toBe("ILLEGAL_TRANSITION");
    expect(await code(ctx.svc.cancel(ctx.brian, c.id))).toBe("ILLEGAL_TRANSITION");
    expect(await code(ctx.svc.requestRevision(ctx.amina, c.id, "Change it"))).toBe("ILLEGAL_TRANSITION");
    ctx.clock.advanceDays(30);
    expect((await ctx.svc.runScheduler()).released).toBe(0);
    expect((await ctx.repo.getBalances("u_amina")).held).toBe(sc(45_000));
    expect((await ctx.repo.getBalances("u_brian")).available).toBe(0);
  });

  it("held money cannot be spent on another contract or withdrawn [FR-4.4, FR-2.6]", async () => {
    await ctx.svc.topUp(ctx.amina, sc(50_000), "topup-key-0001");
    const first = await ctx.svc.createContract(ctx.amina, validContract());
    await ctx.svc.accept(ctx.brian, first.id);
    await ctx.svc.fund(ctx.amina, first.id, "fund-key-0001");
    const second = await ctx.svc.createContract(ctx.amina, validContract({ title: "Second job" }));
    await ctx.svc.accept(ctx.brian, second.id);
    expect(await code(ctx.svc.fund(ctx.amina, second.id, "fund-key-0002"))).toBe("INSUFFICIENT_FUNDS");
    expect(await code(ctx.svc.withdraw(ctx.amina, sc(1), "withdraw-key-0001"))).toBe("FORBIDDEN");
    expect((await ctx.repo.getBalances("u_amina")).held).toBe(sc(45_000));
  });
});

describe("cancelling and rejecting", () => {
  it("either party can cancel before funding, and a funded contract cannot be cancelled alone [FR-3.7]", async () => {
    const byClient = await acceptedContract(ctx);
    expect((await ctx.svc.cancel(ctx.amina, byClient.id, "Changed plans")).state).toBe("cancelled");
    const second = await ctx.svc.createContract(ctx.amina, validContract({ title: "Another" }));
    await ctx.svc.accept(ctx.brian, second.id);
    expect((await ctx.svc.cancel(ctx.brian, second.id, "Too busy")).state).toBe("cancelled");
    const third = await ctx.svc.createContract(ctx.amina, validContract({ title: "Third" }));
    await ctx.svc.accept(ctx.brian, third.id);
    await ctx.svc.fund(ctx.amina, third.id, "fund-key-0003");
    expect(await code(ctx.svc.cancel(ctx.amina, third.id))).toBe("ILLEGAL_TRANSITION");
  });

  const funded = async () => {
    const c = await acceptedContract(ctx);
    await ctx.svc.fund(ctx.amina, c.id, "fund-key-mutual");
    return c;
  };

  it("after funding, cancelling needs both parties and the held money goes back to the client [FR-3.7, FR-2.3]", async () => {
    const c = await funded();
    const before = await ctx.repo.getBalances("u_amina");
    expect(before.held).toBe(c.amount);
    expect((await ctx.svc.cancelFunded(ctx.amina, c.id)).state).toBe("funded");
    expect((await ctx.svc.cancelFunded(ctx.amina, c.id)).state).toBe("funded");
    expect((await ctx.svc.getContractView(ctx.brian, c.id)).cancelRequestedBy).toBe("u_amina");
    expect((await ctx.repo.getBalances("u_amina")).held).toBe(c.amount);
    expect((await ctx.svc.cancelFunded(ctx.brian, c.id)).state).toBe("cancelled");
    const after = await ctx.repo.getBalances("u_amina");
    expect(after.held).toBe(0);
    expect(after.available).toBe(before.available + c.amount);
    expect((await ctx.svc.reconcile(ctx.daniel)).balanced).toBe(true);
    const timeline = (await ctx.svc.getContractView(ctx.amina, c.id)).timeline.map((e) => e.action);
    expect(timeline).toEqual(expect.arrayContaining(["contract.cancel_requested", "contract.mutual_cancel"]));
  });

  it("the other party can turn the request down, outsiders cannot take part, and a dispute clears the request [FR-3.7, FR-9.2]", async () => {
    const c = await funded();
    expect(await code(ctx.svc.declineCancel(ctx.brian, c.id))).toBe("ILLEGAL_TRANSITION");
    await ctx.svc.cancelFunded(ctx.brian, c.id);
    expect(await code(ctx.svc.declineCancel(ctx.brian, c.id))).toBe("ILLEGAL_TRANSITION");
    await ctx.svc.declineCancel(ctx.amina, c.id);
    expect((await ctx.svc.getContractView(ctx.amina, c.id)).cancelRequestedBy).toBeNull();
    expect((await ctx.svc.getContractView(ctx.amina, c.id)).contract.state).toBe("funded");
    expect(await code(ctx.svc.cancelFunded(ctx.grace, c.id))).toBe("NOT_FOUND");
    await ctx.svc.cancelFunded(ctx.brian, c.id);
    await ctx.svc.raiseDispute(ctx.amina, c.id, "No agreement");
    expect((await ctx.svc.getContractView(ctx.amina, c.id)).cancelRequestedBy).toBeNull();
  });

  it("cancelling by agreement is not possible once work is delivered or before funding [FR-3.7]", async () => {
    const accepted = await acceptedContract(ctx);
    expect(await code(ctx.svc.cancelFunded(ctx.amina, accepted.id))).toBe("ILLEGAL_TRANSITION");
    const delivered = await deliveredContract(ctx);
    expect(await code(ctx.svc.cancelFunded(ctx.amina, delivered.id))).toBe("ILLEGAL_TRANSITION");
  });

  it("the freelancer can reject with a reason, and the reason is required [FR-3.3]", async () => {
    const c = await ctx.svc.createContract(ctx.amina, validContract());
    expect(await code(ctx.svc.reject(ctx.brian, c.id, ""))).toBe("VALIDATION");
    expect((await ctx.svc.reject(ctx.brian, c.id, "Out of scope")).state).toBe("rejected");
    const view = await ctx.svc.getContractView(ctx.amina, c.id);
    expect(view.timeline.find((e) => e.action === "contract.reject")?.detail).toBe("Out of scope");
  });
});

describe("audit coverage", () => {
  it("an illegal transition is refused and recorded as a rejected audit entry [FR-3.6, FR-8.1]", async () => {
    const c = await ctx.svc.createContract(ctx.amina, validContract());
    expect(await code(ctx.svc.startWork(ctx.brian, c.id))).toBe("ILLEGAL_TRANSITION");
    const rejected = (await ctx.repo.listAudit()).map(parseAudit).filter((e) => e.result === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({ action: "contract.start_work", actorId: "u_brian", targetId: c.id });
  });

  it("every state change and money movement leaves an audit entry with actor, time and result [FR-8.1, FR-3.9]", async () => {
    const c = await deliveredContract(ctx);
    await ctx.svc.approve(ctx.amina, c.id, "approve-key-0001");
    const actions = (await ctx.repo.listAudit()).map(parseAudit).map((e) => e.action);
    for (const a of ["wallet.topup", "contract.created", "contract.proposed", "contract.accept", "contract.fund", "contract.start_work", "contract.deliver", "contract.approve", "escrow.released"]) {
      expect(actions).toContain(a);
    }
    for (const e of (await ctx.repo.listAudit()).map(parseAudit)) {
      expect(e.at).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
      expect(e.actorRole).toBeTruthy();
    }
  });

  it("admin actions are audited like user actions and visible to auditors [FR-8.7]", async () => {
    await ctx.svc.suspendUser(ctx.daniel, "u_sheila", "Test reason");
    const entry = (await ctx.repo.listAudit()).map(parseAudit).find((e) => e.action === "admin.suspend_user");
    expect(entry).toMatchObject({ actorId: "u_daniel", actorRole: "admin", targetId: "u_sheila", detail: "Test reason" });
    expect((await ctx.svc.verifyAuditChain(ctx.faith)).ok).toBe(true);
  });

  it("no API on the service edits or deletes audit or ledger entries [FR-8.3, FR-9.8]", async () => {
    const names = Object.getOwnPropertyNames(Object.getPrototypeOf(ctx.svc));
    expect(names.filter((n) => /^(edit|update|delete|remove)(Audit|Ledger)/i.test(n))).toEqual([]);
    // The in-memory repository has two clearly named test helpers (tamperAudit, deleteAudit) used only to prove tampering is detected.
    // The app never calls them: only tests do.
    const used = (await import("node:fs")).readdirSync("src", { recursive: true, encoding: "utf8" }).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.ts$/.test(f) && !f.endsWith("memory-repository.ts"));
    const { readFileSync } = await import("node:fs");
    for (const f of used) expect(readFileSync(`src/${f}`, "utf8"), f).not.toMatch(/\b(tamperAudit|deleteAudit)\b/);
  });
});

describe("data minimisation and time", () => {
  it("a user record holds only name, email and role, and no payment credentials are accepted [FR-2.3, NFR-7.1]", async () => {
    const u = await ctx.repo.getUserById("u_amina");
    expect(Object.keys(u ?? {}).sort()).toEqual(["email", "id", "name", "role"]);
    // The simulated gateway takes no card or account details and returns only a reference and a method label.
    const result = await ctx.gateway.charge();
    expect(Object.keys(result).sort()).toEqual(["method", "ok", "reference"]);
  });

  it("deadlines use the server clock: nothing expires early, and the same call after the deadline expires it [NFR-2.5]", async () => {
    const c = await ctx.svc.createContract(ctx.amina, validContract());
    ctx.clock.advanceDays(6);
    expect((await ctx.svc.runScheduler()).expired).toBe(0);
    ctx.clock.advanceDays(2);
    expect((await ctx.svc.runScheduler()).expired).toBe(1);
    expect((await ctx.repo.getContract(c.id))?.state).toBe("expired");
  });

  it("the scheduler can run any number of times and never double-acts after a restart [NFR-4.3]", async () => {
    const c = await deliveredContract(ctx);
    ctx.clock.advanceDays(10);
    const runs = await Promise.all([ctx.svc.runScheduler(), ctx.svc.runScheduler(), ctx.svc.runScheduler()]);
    expect(runs.reduce((n, r) => n + r.released, 0)).toBe(1);
    expect((await ctx.repo.getContract(c.id))?.state).toBe("completed");
    expect((await ctx.svc.reconcile(ctx.daniel)).balanced).toBe(true);
  });
});
