import { beforeEach, describe, expect, it } from "vitest";
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

const counter = (over: Record<string, unknown> = {}) => ({
  totalSC: "40000",
  reviewPeriodDays: 5,
  revisionLimit: 1,
  milestones: [
    { title: "Logo", dueDate: "2026-10-20", amountSC: "20000" },
    { title: "Guide", dueDate: "2026-10-30", amountSC: "20000" },
  ],
  note: "Two milestones are enough.",
  ...over,
});

describe("counter-proposals (FR-3.3)", () => {
  it("creates version 2, hands the turn to the client, and the client can accept it [FR-3.3]", async () => {
    await ctx.svc.topUp(ctx.amina, sc(100_000), "topup-key-0001");
    const c = await ctx.svc.createContract(ctx.amina, validContract());
    const after = await ctx.svc.counterPropose(ctx.brian, c.id, counter());
    expect(after.state).toBe("proposed");
    expect(after.amount).toBe(sc(40_000));
    expect(after.milestones).toHaveLength(2);

    const clientView = await ctx.svc.getContractView(ctx.amina, c.id);
    expect(clientView.terms).toMatchObject({ version: 2, awaiting: "client" });
    expect(clientView.terms.history[0].terms.amount).toBe(sc(45_000));
    expect(clientView.actions).toEqual(expect.arrayContaining(["accept_counter", "decline_counter"]));
    expect(clientView.actions).not.toContain("accept");
    const freelancerView = await ctx.svc.getContractView(ctx.brian, c.id);
    expect(freelancerView.actions).toEqual([]);

    const accepted = await ctx.svc.acceptCounter(ctx.amina, c.id);
    expect(accepted.state).toBe("accepted");
    const funded = await ctx.svc.fund(ctx.amina, c.id, "fund-key-0001");
    expect(funded.amount).toBe(sc(40_000));
    expect((await ctx.repo.getBalances("u_amina")).held).toBe(sc(40_000));
  });

  it("the freelancer cannot accept their own counter, and the client cannot accept before one exists [FR-3.3, FR-3.6]", async () => {
    const c = await ctx.svc.createContract(ctx.amina, validContract());
    expect(await code(ctx.svc.acceptCounter(ctx.amina, c.id))).toBe("ILLEGAL_TRANSITION");
    await ctx.svc.counterPropose(ctx.brian, c.id, counter());
    expect(await code(ctx.svc.accept(ctx.brian, c.id))).toBe("ILLEGAL_TRANSITION");
    expect(await code(ctx.svc.counterPropose(ctx.brian, c.id, counter({ note: "again please" })))).toBe("ILLEGAL_TRANSITION");
    expect(await code(ctx.svc.acceptCounter(ctx.brian, c.id))).toBe("ILLEGAL_TRANSITION");
    const rejected = (await ctx.repo.listAudit()).filter((e) => e.payload.includes('"result":"rejected"'));
    expect(rejected.length).toBeGreaterThanOrEqual(3);
  });

  it("declining cancels the contract [FR-3.3, FR-3.7]", async () => {
    const c = await ctx.svc.createContract(ctx.amina, validContract());
    await ctx.svc.counterPropose(ctx.brian, c.id, counter());
    expect((await ctx.svc.declineCounter(ctx.amina, c.id, "Too low for me")).state).toBe("cancelled");
  });

  it("validates the new terms and needs a real change [FR-3.3, FR-3.12]", async () => {
    const c = await ctx.svc.createContract(ctx.amina, validContract());
    expect(await code(ctx.svc.counterPropose(ctx.brian, c.id, counter({ totalSC: "50000" })))).toBe("VALIDATION");
    expect(await code(ctx.svc.counterPropose(ctx.brian, c.id, counter({ note: "" })))).toBe("VALIDATION");
    const same = counter({
      totalSC: "45000",
      reviewPeriodDays: 3,
      revisionLimit: 2,
      milestones: validContract().milestones.map((m) => ({ ...m })),
    });
    expect(await code(ctx.svc.counterPropose(ctx.brian, c.id, same))).toBe("VALIDATION");
    expect(await code(ctx.svc.counterPropose(ctx.amina, c.id, counter()))).toBe("ILLEGAL_TRANSITION");
  });

  it("terms cannot be changed once the contract is funded (FR-3.4) [FR-3.4]", async () => {
    const c = await acceptedContract(ctx);
    await ctx.svc.fund(ctx.amina, c.id, "fund-key-0001");
    expect(await code(ctx.svc.counterPropose(ctx.brian, c.id, counter()))).toBe("ILLEGAL_TRANSITION");
  });
});

const dispute = async () => {
  const c = await deliveredContract(ctx);
  await ctx.svc.raiseDispute(ctx.amina, c.id, "Wrong file");
  return c;
};

describe("assigned arbitrators only (FR-3.10, FR-6.4)", () => {
  it("an unassigned dispute is invisible to arbitrators until an administrator assigns one [FR-3.10, FR-6.4]", async () => {
    const c = await dispute();
    expect(await ctx.svc.listDisputes(ctx.grace)).toEqual([]);
    expect(await code(ctx.svc.getDisputeView(ctx.grace, c.id))).toBe("NOT_FOUND");
    expect(await code(ctx.svc.resolveDispute(ctx.grace, c.id, { decision: "refund", note: "Fair." }))).toBe("NOT_FOUND");
    expect((await ctx.svc.listDisputeQueue(ctx.daniel))[0].assignedTo).toBeNull();
    await ctx.svc.assignArbitrator(ctx.daniel, c.id, "u_grace");
    expect((await ctx.svc.listDisputes(ctx.grace)).map((r) => r.contract.id)).toEqual([c.id]);
  });

  it("only administrators assign, parties cannot be assigned, and reassigning to the same person is refused [FR-6.4, FR-9.5]", async () => {
    const c = await dispute();
    expect(await code(ctx.svc.assignArbitrator(ctx.grace, c.id, "u_grace"))).toBe("FORBIDDEN");
    expect(await code(ctx.svc.assignArbitrator(ctx.daniel, c.id, "u_brian"))).toBe("VALIDATION");
    await ctx.svc.assignArbitrator(ctx.daniel, c.id, "u_grace");
    expect(await code(ctx.svc.assignArbitrator(ctx.daniel, c.id, "u_grace"))).toBe("CONFLICT");
  });

  it("another arbitrator cannot see or rule on a case that is not theirs [FR-3.10, FR-1.12]", async () => {
    const c = await dispute();
    await ctx.repo.upsertUser({ id: "u_other", name: "Other Arb", email: "o@example.com", role: "arbitrator" });
    await ctx.svc.assignArbitrator(ctx.daniel, c.id, "u_grace");
    const other = { id: "u_other", role: "arbitrator" as const };
    expect(await code(ctx.svc.getDisputeView(other, c.id))).toBe("NOT_FOUND");
    expect(await code(ctx.svc.resolveDispute(other, c.id, { decision: "refund", note: "Fair." }))).toBe("NOT_FOUND");
    await ctx.svc.assignArbitrator(ctx.daniel, c.id, "u_other");
    expect(await ctx.svc.listDisputes(ctx.grace)).toEqual([]);
    expect(await ctx.svc.listDisputes(other)).toHaveLength(1);
  });

  it("auto-assign picks the arbitrator with the fewest open cases [FR-6.4, FR-9.5]", async () => {
    await ctx.repo.upsertUser({ id: "u_other", name: "Other Arb", email: "o@example.com", role: "arbitrator" });
    const c = await dispute();
    await ctx.svc.assignArbitrator(ctx.daniel, c.id, "u_grace");
    const second = await deliveredContract(ctx).catch(() => null);
    expect(second).toBeNull(); // wallet already spent: one contract per test is enough
    const arbs = await ctx.svc.listArbitrators(ctx.daniel);
    expect(arbs[0].user.id).toBe("u_other");
    expect((await ctx.svc.autoAssign(ctx.daniel, c.id)).id).toBe("u_other");
  });
});

describe("dispute evidence and questions (FR-6.3, FR-6.5)", () => {
  const file = (n: string) => ({ name: n, sizeBytes: 1000, sha256: "b".repeat(64) });

  it("both parties add evidence that is hashed, ordered and visible to the other side and the arbitrator [FR-6.3, FR-6.5]", async () => {
    const c = await dispute();
    await ctx.svc.submitEvidence(ctx.amina, c.id, { text: "Brief says 10s", files: [file("brief.pdf")] });
    await ctx.svc.submitEvidence(ctx.brian, c.id, { text: "Storyboard said 6s", files: [] });
    const view = await ctx.svc.getContractView(ctx.brian, c.id);
    expect(view.caseFile?.evidence.map((e) => e.by)).toEqual(["client", "freelancer"]);
    expect(view.caseFile?.evidence[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(view.caseFile?.evidence[0].files[0].name).toBe("brief.pdf");
    await ctx.svc.assignArbitrator(ctx.daniel, c.id, "u_grace");
    expect((await ctx.svc.getDisputeView(ctx.grace, c.id)).caseFile.evidence).toHaveLength(2);
  });

  it("is refused when empty, over five files, from outsiders, or for a contract that is not disputed [FR-6.3]", async () => {
    const c = await dispute();
    expect(await code(ctx.svc.submitEvidence(ctx.amina, c.id, { text: "", files: [] }))).toBe("VALIDATION");
    const six = Array.from({ length: 6 }, (_, i) => file(`f${i}.pdf`));
    expect(await code(ctx.svc.submitEvidence(ctx.amina, c.id, { text: "x", files: six }))).toBe("VALIDATION");
    await ctx.svc.submitEvidence(ctx.amina, c.id, { text: "", files: six.slice(0, 3) });
    expect(await code(ctx.svc.submitEvidence(ctx.amina, c.id, { text: "", files: six.slice(0, 3) }))).toBe("LIMIT");
    expect(await code(ctx.svc.submitEvidence(ctx.sheila, c.id, { text: "hi", files: [] }))).toBe("NOT_FOUND");
    expect(await code(ctx.svc.submitEvidence(ctx.amina, c.id, { text: "<b>x</b>", files: [{ name: "../x.exe", sizeBytes: 1, sha256: "b".repeat(64) }] }))).toBe("VALIDATION");
  });

  it("closes after the evidence window, but an arbitrator's question reopens it for the side asked [FR-6.3, FR-6.5]", async () => {
    const c = await dispute();
    await ctx.svc.assignArbitrator(ctx.daniel, c.id, "u_grace");
    ctx.clock.advanceDays(6);
    expect(await code(ctx.svc.submitEvidence(ctx.amina, c.id, { text: "late", files: [] }))).toBe("LIMIT");
    await ctx.svc.requestInfo(ctx.grace, c.id, { to: "client", question: "Please send the signed brief." });
    const asked = await ctx.svc.getContractView(ctx.amina, c.id);
    expect(asked.evidence.canSubmit).toBe(true);
    expect((await ctx.svc.getContractView(ctx.brian, c.id)).evidence.canSubmit).toBe(false);
    await ctx.svc.submitEvidence(ctx.amina, c.id, { text: "Here it is", files: [file("brief.pdf")] });
    const answered = await ctx.svc.getContractView(ctx.amina, c.id);
    expect(answered.caseFile?.requests[0].answered).toBe(true);
    expect(answered.evidence.canSubmit).toBe(false);
  });

  it("only the assigned arbitrator can ask, and the question needs text [FR-6.5]", async () => {
    const c = await dispute();
    expect(await code(ctx.svc.requestInfo(ctx.grace, c.id, { to: "client", question: "Why?" }))).toBe("NOT_FOUND");
    await ctx.svc.assignArbitrator(ctx.daniel, c.id, "u_grace");
    expect(await code(ctx.svc.requestInfo(ctx.grace, c.id, { to: "client", question: "" }))).toBe("VALIDATION");
    expect(await code(ctx.svc.requestInfo(ctx.amina, c.id, { to: "freelancer", question: "Why?" }))).toBe("FORBIDDEN");
  });

  it("evidence from an earlier dispute round does not carry into a new one [FR-6.3]", async () => {
    const c = await dispute();
    await ctx.svc.submitEvidence(ctx.amina, c.id, { text: "Round one", files: [] });
    await ctx.svc.withdrawDispute(ctx.brian, c.id);
    await ctx.svc.withdrawDispute(ctx.amina, c.id);
    await ctx.svc.raiseDispute(ctx.amina, c.id, "Again");
    expect((await ctx.svc.getContractView(ctx.amina, c.id)).caseFile?.evidence).toEqual([]);
  });
});

describe("administration (FR-9)", () => {
  it("is for administrators only [FR-1.12, FR-9.1]", async () => {
    expect(await code(ctx.svc.adminOverview(ctx.grace))).toBe("FORBIDDEN");
    expect(await code(ctx.svc.listUsers(ctx.faith))).toBe("FORBIDDEN");
    expect(await code(ctx.svc.suspendUser(ctx.amina, "u_brian", "bad"))).toBe("FORBIDDEN");
  });

  it("the overview counts users, contracts, held funds and open disputes [FR-9.1, FR-9.7]", async () => {
    await dispute();
    const o = await ctx.svc.adminOverview(ctx.daniel);
    expect(o.usersByRole).toMatchObject({ client: 1, freelancer: 2, arbitrator: 1, admin: 1, auditor: 1 });
    expect(o.contractsByState.disputed).toBe(1);
    expect(o.held).toBe(sc(45_000));
    expect(o).toMatchObject({ openDisputes: 1, unassigned: 1, overdue: 0 });
    expect(o.health).toMatchObject({ ledgerBalanced: true, chainIntact: true });
    ctx.clock.advanceDays(8);
    expect((await ctx.svc.adminOverview(ctx.daniel)).overdue).toBe(1);
  });

  it("a suspended user cannot act, their live contracts are flagged and frozen, and reactivation restores them [FR-9.2, FR-9.6]", async () => {
    const c = await deliveredContract(ctx);
    await ctx.svc.suspendUser(ctx.daniel, "u_amina", "Chargeback investigation");
    expect(await code(ctx.svc.approve(ctx.amina, c.id, "approve-key-0001"))).toBe("FORBIDDEN");
    expect(await code(ctx.svc.topUp(ctx.amina, sc(100), "topup-key-0009"))).toBe("FORBIDDEN");
    expect((await ctx.svc.adminOverview(ctx.daniel)).flagged).toBe(1);
    ctx.clock.advanceDays(5);
    expect((await ctx.svc.runScheduler()).released).toBe(0);
    expect((await ctx.repo.getContract(c.id))?.state).toBe("delivered");
    await ctx.svc.reactivateUser(ctx.daniel, "u_amina");
    expect((await ctx.svc.runScheduler()).released).toBe(1);
  });

  it("cannot suspend yourself or suspend twice, and reactivating an active user is refused [FR-9.2]", async () => {
    expect(await code(ctx.svc.suspendUser(ctx.daniel, "u_daniel", "oops"))).toBe("FORBIDDEN");
    await ctx.svc.suspendUser(ctx.daniel, "u_brian", "Spam");
    expect(await code(ctx.svc.suspendUser(ctx.daniel, "u_brian", "Spam"))).toBe("CONFLICT");
    expect(await code(ctx.svc.reactivateUser(ctx.daniel, "u_sheila"))).toBe("CONFLICT");
  });

  it("creates arbitrator and auditor accounts only, with a unique email [FR-1.1, FR-9.3]", async () => {
    const u = await ctx.svc.createStaffAccount(ctx.daniel, { name: "New Arb", email: "NEW@example.com", role: "arbitrator" }, "local");
    expect(u?.email).toBe("new@example.com");
    expect((await ctx.repo.getUserByEmail("new@example.com"))?.role).toBe("arbitrator");
    expect(await code(ctx.svc.createStaffAccount(ctx.daniel, { name: "Dup", email: "new@example.com", role: "auditor" }, "local"))).toBe("VALIDATION");
    expect(await code(ctx.svc.createStaffAccount(ctx.daniel, { name: "Sneaky", email: "s@example.com", role: "admin" }, "local"))).toBe("VALIDATION");
    expect(await ctx.svc.createStaffAccount(ctx.daniel, { name: "Invited", email: "i@example.com", role: "auditor" }, "invite")).toBeNull();
    expect(await ctx.repo.getUserByEmail("i@example.com")).toBeNull();
  });

  const settings = (over: Record<string, unknown> = {}) => ({
    feePercent: 3,
    defaultReviewDays: 4,
    defaultRevisionLimit: 1,
    proposalDays: 5,
    fundingDays: 6,
    evidenceDays: 3,
    arbitrationDays: 10,
    topUpMinSC: "50",
    topUpMaxSC: "20000",
    topUpDailyMaxSC: "60000",
    ...over,
  });

  it("changed settings apply to new contracts and limits, are audited with old and new values, and old contracts keep their fee [FR-9.4, FR-4.6, FR-8.7]", async () => {
    await ctx.svc.topUp(ctx.amina, sc(100_000), "topup-key-0001");
    const old = await ctx.svc.createContract(ctx.amina, validContract());
    await ctx.svc.updateSettings(ctx.daniel, settings());
    const fresh = await ctx.svc.createContract(ctx.amina, validContract({ title: "Second job" }));
    expect(old.feeBps).toBe(200);
    expect(fresh.feeBps).toBe(300);
    expect(new Date(fresh.expiresAt as string).getTime() - ctx.clock.now().getTime()).toBe(5 * 86_400_000);
    expect(await code(ctx.svc.topUp(ctx.amina, sc(30_000), "topup-key-0002"))).toBe("LIMIT");
    const entry = (await ctx.repo.listAudit()).map((e) => JSON.parse(e.payload)).find((p) => p.action === "admin.settings_changed");
    expect(entry.before.feeBps).toBe(200);
    expect(entry.after.feeBps).toBe(300);
    expect((await ctx.svc.getConfig()).evidenceDays).toBe(3);
  });

  it("rejects out-of-range or inconsistent settings and no-op saves [FR-9.4]", async () => {
    expect(await code(ctx.svc.updateSettings(ctx.daniel, settings({ feePercent: 25 })))).toBe("VALIDATION");
    expect(await code(ctx.svc.updateSettings(ctx.daniel, settings({ evidenceDays: 0 })))).toBe("VALIDATION");
    expect(await code(ctx.svc.updateSettings(ctx.daniel, settings({ topUpMinSC: "500", topUpMaxSC: "100" })))).toBe("VALIDATION");
    expect(await code(ctx.svc.updateSettings(ctx.daniel, settings({ topUpDailyMaxSC: "100" })))).toBe("VALIDATION");
    expect(await code(ctx.svc.updateSettings(ctx.daniel, settings({ feePercent: 2, defaultReviewDays: 3, defaultRevisionLimit: 2, proposalDays: 7, fundingDays: 7, evidenceDays: 5, arbitrationDays: 7, topUpMinSC: "10", topUpMaxSC: "100000", topUpDailyMaxSC: "500000" })))).toBe("VALIDATION");
    expect(await code(ctx.svc.updateSettings(ctx.grace, settings()))).toBe("FORBIDDEN");
  });

  it("the audit chain stays intact and the ledger balanced after all of this [FR-8.4, FR-9.7, FR-9.8]", async () => {
    const c = await dispute();
    await ctx.svc.assignArbitrator(ctx.daniel, c.id, "u_grace");
    await ctx.svc.submitEvidence(ctx.amina, c.id, { text: "x1", files: [] });
    await ctx.svc.suspendUser(ctx.daniel, "u_sheila", "Test");
    expect((await ctx.svc.verifyAuditChain(ctx.faith)).ok).toBe(true);
    expect((await ctx.svc.reconcile(ctx.faith)).balanced).toBe(true);
  });
});
