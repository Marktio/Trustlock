import { beforeEach, describe, expect, it } from "vitest";
import { deliveredContract, sc, setup, validContract } from "@/test/helpers";

let ctx: Awaited<ReturnType<typeof setup>>;
beforeEach(async () => {
  ctx = await setup();
});

describe("in-app notifications [FR-7.1]", () => {
  it("each state change notifies the person it affects, and not the person who did it", async () => {
    const c = await deliveredContract(ctx);
    const brian = await ctx.svc.listNotifications(ctx.brian);
    const amina = await ctx.svc.listNotifications(ctx.amina);
    const titles = (l: typeof brian) => l.items.map((n) => n.title);
    expect(titles(brian)).toEqual(expect.arrayContaining(["New contract proposal", "Escrow funded"]));
    expect(titles(brian)).not.toContain("Work delivered");
    expect(titles(amina)).toEqual(expect.arrayContaining(["Proposal accepted", "Work started", "Work delivered"]));
    expect(titles(amina)).not.toContain("Escrow funded");
    expect(amina.items.every((n) => n.contractId === c.id)).toBe(true);
  });

  it("both sides hear about automatic and system events, and the arbitrator about an assignment", async () => {
    await deliveredContract(ctx);
    const d = await deliveredContract2();
    await ctx.svc.raiseDispute(ctx.brian, d.id, "No answer");
    await ctx.svc.assignArbitrator(ctx.daniel, d.id, "u_grace");
    ctx.clock.advanceDays(30);
    await ctx.svc.runScheduler();
    for (const who of [ctx.amina, ctx.brian]) {
      expect((await ctx.svc.listNotifications(who)).items.map((n) => n.title)).toEqual(expect.arrayContaining(["Review period ended", "Payment released"]));
    }
    expect((await ctx.svc.listNotifications(ctx.grace)).items.map((n) => n.title)).toContain("New case assigned");
    expect((await ctx.svc.listNotifications(ctx.amina)).items.map((n) => n.title)).toEqual(expect.arrayContaining(["Dispute raised", "Arbitrator assigned"]));
  });

  async function deliveredContract2() {
    await ctx.svc.topUp(ctx.amina, sc(60_000), "topup-key-0009");
    const n = await ctx.svc.createContract(ctx.amina, validContract({ title: "Second job" }));
    await ctx.svc.accept(ctx.brian, n.id);
    await ctx.svc.fund(ctx.amina, n.id, "fund-key-0009");
    await ctx.svc.startWork(ctx.brian, n.id);
    return ctx.svc.deliver(ctx.brian, n.id, (await import("@/test/helpers")).goodFile);
  }

  it("unread counts fall to zero when marked read and rise again with new events", async () => {
    await deliveredContract(ctx);
    const before = await ctx.svc.unreadCount(ctx.amina);
    expect(before).toBeGreaterThan(0);
    await ctx.svc.markNotificationsRead(ctx.amina);
    expect(await ctx.svc.unreadCount(ctx.amina)).toBe(0);
    expect(await ctx.svc.unreadCount(ctx.brian)).toBeGreaterThan(0);
    await ctx.svc.markNotificationsRead(ctx.amina);
    const delivered = (await ctx.svc.listContracts(ctx.amina))[0].contract;
    await ctx.svc.approve(ctx.amina, delivered.id, "approve-key-1");
    expect(await ctx.svc.unreadCount(ctx.amina)).toBeGreaterThan(0);
  });

  it("people only ever see their own notifications, and an outsider sees none [FR-3.10]", async () => {
    await deliveredContract(ctx);
    expect((await ctx.svc.listNotifications(ctx.sheila)).items).toEqual([]);
    expect((await ctx.svc.listNotifications(ctx.grace)).items).toEqual([]);
  });

  it("suspension sends a security alert to the person affected [FR-7.2]", async () => {
    await ctx.svc.suspendUser(ctx.daniel, "u_brian", "Testing");
    expect((await ctx.svc.listNotifications(ctx.brian)).items.map((n) => n.title)).toContain("Security alert: account suspended");
  });
});

describe("simulated email and the mail catcher [FR-7.2, FR-7.5]", () => {
  it("emails go out for the listed events and only an administrator can open the catcher", async () => {
    await deliveredContract(ctx);
    const mails = await ctx.svc.mailCatcher(ctx.daniel);
    const subjects = mails.map((m) => m.subject);
    expect(subjects).toEqual(expect.arrayContaining(["[TrustLock] New contract proposal", "[TrustLock] Escrow funded", "[TrustLock] Work delivered"]));
    expect(mails.find((m) => m.subject.includes("Work delivered"))?.to).toBe("amina@example.com");
    await expect(ctx.svc.mailCatcher(ctx.amina)).rejects.toThrow();
  });

  it("messages never copy typed text, passwords, tokens or keys", async () => {
    const c = await deliveredContract(ctx);
    await ctx.svc.sendMessage(ctx.amina, c.id, "My password is hunter2 and token sk_live_ABC123");
    await ctx.svc.raiseDispute(ctx.amina, c.id, "secret reason: password=hunter2");
    await ctx.svc.submitEvidence(ctx.amina, c.id, { text: "token sk_live_ABC123", files: [] });
    const all = [
      ...(await ctx.svc.mailCatcher(ctx.daniel)).map((m) => `${m.subject} ${m.body}`),
      ...(await ctx.svc.listNotifications(ctx.brian)).items.map((n) => `${n.title} ${n.body}`),
    ].join("\n");
    expect(all).not.toMatch(/hunter2|sk_live|password|token/i);
  });
});
