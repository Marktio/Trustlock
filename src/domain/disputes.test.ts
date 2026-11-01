import { beforeEach, describe, expect, it } from "vitest";
import { DomainError } from "./errors";
import { deliveredContract, sc, setup } from "@/test/helpers";

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

const heldOf = async (id: string) => (await ctx.repo.getBalances(id)).held;
const availOf = async (id: string) => (await ctx.repo.getBalances(id)).available;

describe("messages", () => {
  it("are visible to both sides in order and stay out of the timeline [FR-3.9]", async () => {
    const c = await deliveredContract(ctx);
    await ctx.svc.sendMessage(ctx.amina, c.id, "Can you shorten the intro?");
    await ctx.svc.sendMessage(ctx.brian, c.id, "Yes, today.");
    const view = await ctx.svc.getContractView(ctx.brian, c.id);
    expect(view.messages.map((m) => m.detail)).toEqual(["Can you shorten the intro?", "Yes, today."]);
    expect(view.timeline.some((e) => e.action === "message.sent")).toBe(false);
  });

  it("are refused for empty text, for outsiders and when sent too fast [FR-3.12, FR-3.10]", async () => {
    const c = await deliveredContract(ctx);
    expect(await code(ctx.svc.sendMessage(ctx.amina, c.id, "   "))).toBe("VALIDATION");
    expect(await code(ctx.svc.sendMessage(ctx.sheila, c.id, "hi"))).not.toBe("no error");
    for (let i = 0; i < 10; i++) await ctx.svc.sendMessage(ctx.amina, c.id, `m${i}`);
    expect(await code(ctx.svc.sendMessage(ctx.amina, c.id, "one more"))).toBe("LIMIT");
  });
});

describe("raising and withdrawing a dispute", () => {
  it("freezes a delivered contract with the money still held, and records who raised it and why [FR-6.1, FR-6.2, FR-4.4]", async () => {
    const c = await deliveredContract(ctx);
    const d = await ctx.svc.raiseDispute(ctx.amina, c.id, "Wrong file");
    expect(d.state).toBe("disputed");
    expect(d.reviewEndsAt).toBeNull();
    expect(await heldOf("u_amina")).toBe(sc(45_000));
    const view = await ctx.svc.getContractView(ctx.brian, c.id);
    expect(view.dispute).toMatchObject({ reason: "Wrong file", raisedBy: "u_amina", stateBefore: "delivered" });
    expect(view.actions).toContain("withdraw_dispute");
  });

  it("needs a reason and cannot be raised from a state that has no work yet [FR-6.1]", async () => {
    const c = await deliveredContract(ctx);
    expect(await code(ctx.svc.raiseDispute(ctx.amina, c.id, "x"))).toBe("VALIDATION");
    const proposed = await ctx.svc.createContract(ctx.amina, (await import("@/test/helpers")).validContract());
    expect(await code(ctx.svc.raiseDispute(ctx.amina, proposed.id, "Not happy"))).not.toBe("no error");
  });

  it("withdrawing returns a delivered contract to delivered with a fresh review period [FR-6.8]", async () => {
    const c = await deliveredContract(ctx);
    await ctx.svc.raiseDispute(ctx.brian, c.id, "Client is not answering");
    ctx.clock.advanceDays(10);
    expect((await ctx.svc.withdrawDispute(ctx.amina, c.id)).state).toBe("disputed");
    const back = await ctx.svc.withdrawDispute(ctx.brian, c.id);
    expect(back.state).toBe("delivered");
    expect(new Date(back.reviewEndsAt as string).getTime()).toBeGreaterThan(ctx.clock.now().getTime());
  });
});

describe("withdrawing needs both sides", () => {
  it("one side asking is not enough; the other side agreeing ends it, and asking twice changes nothing [FR-6.8]", async () => {
    const c = await deliveredContract(ctx);
    await ctx.svc.raiseDispute(ctx.brian, c.id, "Client is not answering");
    expect((await ctx.svc.withdrawDispute(ctx.brian, c.id)).state).toBe("disputed");
    expect((await ctx.svc.withdrawDispute(ctx.brian, c.id)).state).toBe("disputed");
    const view = await ctx.svc.getContractView(ctx.amina, c.id);
    expect(view.dispute?.withdrawRequestedBy).toBe("u_brian");
    expect((await ctx.svc.withdrawDispute(ctx.amina, c.id)).state).toBe("delivered");
    expect((await ctx.svc.getContractView(ctx.amina, c.id)).dispute).toBeNull();
  });

  it("a request does not carry into a later dispute, and outsiders cannot withdraw [FR-6.8, FR-9.2]", async () => {
    const c = await deliveredContract(ctx);
    await ctx.svc.raiseDispute(ctx.brian, c.id, "First");
    await ctx.svc.withdrawDispute(ctx.brian, c.id);
    await ctx.svc.withdrawDispute(ctx.amina, c.id);
    await ctx.svc.raiseDispute(ctx.amina, c.id, "Second");
    expect((await ctx.svc.getContractView(ctx.amina, c.id)).dispute?.withdrawRequestedBy).toBeNull();
    await expect(ctx.svc.withdrawDispute(ctx.grace, c.id)).rejects.toThrow();
  });
});

describe("arbitrator rulings", () => {
  it("release pays the freelancer minus the fee [FR-6.6, FR-6.7, FR-9.7]", async () => {
    const c = await deliveredContract(ctx);
    await ctx.svc.raiseDispute(ctx.amina, c.id, "Not what I asked for");
    await ctx.svc.assignArbitrator(ctx.daniel, c.id, "u_grace");
    const done = await ctx.svc.resolveDispute(ctx.grace, c.id, { decision: "release", note: "Work matches the brief." });
    expect(done.state).toBe("completed");
    expect(await availOf("u_brian")).toBe(sc(45_000) - sc(900));
    expect(await heldOf("u_amina")).toBe(0);
    expect((await ctx.svc.reconcile(ctx.daniel)).balanced).toBe(true);
  });

  it("refund returns everything to the client [FR-6.6, FR-6.7]", async () => {
    const c = await deliveredContract(ctx);
    const before = await availOf("u_amina");
    await ctx.svc.raiseDispute(ctx.amina, c.id, "Nothing usable");
    await ctx.svc.assignArbitrator(ctx.daniel, c.id, "u_grace");
    const done = await ctx.svc.resolveDispute(ctx.grace, c.id, { decision: "refund", note: "File is empty." });
    expect(done.state).toBe("refunded");
    expect(await availOf("u_amina")).toBe(before + sc(45_000));
    expect(await availOf("u_brian")).toBe(0);
  });

  it("split divides the money, takes the fee from the freelancer's share only, and the ledger still balances [FR-6.6, FR-6.7, NFR-2.3]", async () => {
    const c = await deliveredContract(ctx);
    const before = await availOf("u_amina");
    await ctx.svc.raiseDispute(ctx.amina, c.id, "Half done");
    await ctx.svc.assignArbitrator(ctx.daniel, c.id, "u_grace");
    const done = await ctx.svc.resolveDispute(ctx.grace, c.id, { decision: "split", freelancerPercent: 60, note: "Two of three parts delivered." });
    expect(done.state).toBe("resolved_split");
    const freelancerShare = sc(27_000);
    expect(await availOf("u_brian")).toBe(freelancerShare - Math.round(freelancerShare * 0.02));
    expect(await availOf("u_amina")).toBe(before + sc(18_000));
    expect(await heldOf("u_amina")).toBe(0);
    expect((await ctx.svc.reconcile(ctx.daniel)).balanced).toBe(true);
  });

  it("a split needs a percentage from 1 to 99 and every ruling needs a reason [FR-6.6]", async () => {
    const c = await deliveredContract(ctx);
    await ctx.svc.raiseDispute(ctx.amina, c.id, "Half done");
    await ctx.svc.assignArbitrator(ctx.daniel, c.id, "u_grace");
    expect(await code(ctx.svc.resolveDispute(ctx.grace, c.id, { decision: "split", note: "reason here" }))).toBe("VALIDATION");
    expect(await code(ctx.svc.resolveDispute(ctx.grace, c.id, { decision: "split", freelancerPercent: 100, note: "reason here" }))).toBe("VALIDATION");
    expect(await code(ctx.svc.resolveDispute(ctx.grace, c.id, { decision: "release", note: "" }))).toBe("VALIDATION");
  });

  it("only an arbitrator can rule, and a ruling cannot be applied twice [FR-1.12, FR-6.7]", async () => {
    const c = await deliveredContract(ctx);
    await ctx.svc.raiseDispute(ctx.amina, c.id, "Half done");
    await ctx.svc.assignArbitrator(ctx.daniel, c.id, "u_grace");
    expect(await code(ctx.svc.resolveDispute(ctx.amina, c.id, { decision: "refund", note: "give it back" }))).toBe("FORBIDDEN");
    expect(await code(ctx.svc.resolveDispute(ctx.daniel, c.id, { decision: "refund", note: "give it back" }))).toBe("FORBIDDEN");
    await ctx.svc.resolveDispute(ctx.grace, c.id, { decision: "refund", note: "Fair." });
    expect(await code(ctx.svc.resolveDispute(ctx.grace, c.id, { decision: "refund", note: "Again." }))).not.toBe("no error");
    expect((await ctx.svc.reconcile(ctx.daniel)).balanced).toBe(true);
  });

  it("the arbitrator queue lists open cases and the case view shows the reason and the messages [FR-6.5]", async () => {
    const c = await deliveredContract(ctx);
    await ctx.svc.sendMessage(ctx.amina, c.id, "This is wrong");
    await ctx.svc.raiseDispute(ctx.amina, c.id, "Wrong file");
    await ctx.svc.assignArbitrator(ctx.daniel, c.id, "u_grace");
    expect((await ctx.svc.listDisputes(ctx.grace)).map((r) => r.contract.id)).toEqual([c.id]);
    const view = await ctx.svc.getDisputeView(ctx.grace, c.id);
    expect(view.dispute?.reason).toBe("Wrong file");
    expect(view.messages.map((m) => m.detail)).toEqual(["This is wrong"]);
    expect(await code(ctx.svc.listDisputes(ctx.amina))).toBe("FORBIDDEN");
    await ctx.svc.resolveDispute(ctx.grace, c.id, { decision: "refund", note: "Fair." });
    expect(await ctx.svc.listDisputes(ctx.grace)).toEqual([]);
  });
});
