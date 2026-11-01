import { EscrowService, DEFAULT_CONFIG } from "@/domain/escrow-service";
import { SimulatedGateway } from "@/domain/gateway";
import { MemoryRepository } from "@/server/memory-repository";
import type { Actor, Clock, User } from "@/domain/types";

export class FakeClock implements Clock {
  constructor(private t = new Date("2026-10-01T09:00:00Z")) {}
  now() {
    return new Date(this.t);
  }
  advanceDays(days: number) {
    this.t = new Date(this.t.getTime() + days * 86_400_000);
  }
}

export const sc = (n: number) => n * 100;

export const USERS: Record<string, User> = {
  amina: { id: "u_amina", name: "Amina Wanjiru", email: "amina@example.com", role: "client" },
  brian: { id: "u_brian", name: "Brian Otieno", email: "brian@example.com", role: "freelancer" },
  sheila: { id: "u_sheila", name: "Sheila Njeri", email: "sheila@example.com", role: "freelancer" },
  grace: { id: "u_grace", name: "Grace Mutua", email: "grace@example.com", role: "arbitrator" },
  daniel: { id: "u_daniel", name: "Daniel Kiprop", email: "daniel@example.com", role: "admin" },
  faith: { id: "u_faith", name: "Faith Achieng", email: "faith@example.com", role: "auditor" },
};

export const actorOf = (u: User): Actor => ({ id: u.id, role: u.role });

export async function setup() {
  const clock = new FakeClock();
  const repo = new MemoryRepository(clock);
  const gateway = new SimulatedGateway();
  const svc = new EscrowService(repo, clock, gateway, DEFAULT_CONFIG);
  for (const u of Object.values(USERS)) await repo.upsertUser(u);
  return {
    clock,
    repo,
    gateway,
    svc,
    amina: actorOf(USERS.amina),
    brian: actorOf(USERS.brian),
    sheila: actorOf(USERS.sheila),
    grace: actorOf(USERS.grace),
    daniel: actorOf(USERS.daniel),
    faith: actorOf(USERS.faith),
  };
}

export const validContract = (overrides: Record<string, unknown> = {}) => ({
  title: "Brand identity refresh",
  description: "Logo, palette and a brand guide.",
  freelancerEmail: "brian@example.com",
  totalSC: "45000",
  reviewPeriodDays: 3,
  revisionLimit: 2,
  milestones: [
    { title: "Logo concepts", dueDate: "2026-10-10", amountSC: "15000" },
    { title: "Chosen logo refined", dueDate: "2026-10-18", amountSC: "15000" },
    { title: "Brand guide PDF", dueDate: "2026-10-28", amountSC: "15000" },
  ],
  ...overrides,
});

export const goodFile = {
  fileName: "logo-concepts-v1.zip",
  sizeBytes: 18_400_000,
  sha256: "a".repeat(64),
  note: "Three directions attached.",
};

/** A proposed contract, accepted by the freelancer and ready to fund. */
export async function acceptedContract(ctx: Awaited<ReturnType<typeof setup>>) {
  await ctx.svc.topUp(ctx.amina, sc(100_000), "topup-key-0001");
  await ctx.svc.topUp(ctx.amina, sc(50_000), "topup-key-0002");
  const c = await ctx.svc.createContract(ctx.amina, validContract());
  return ctx.svc.accept(ctx.brian, c.id);
}

export async function deliveredContract(ctx: Awaited<ReturnType<typeof setup>>) {
  const c = await acceptedContract(ctx);
  await ctx.svc.fund(ctx.amina, c.id, "fund-key-0001");
  await ctx.svc.startWork(ctx.brian, c.id);
  return ctx.svc.deliver(ctx.brian, c.id, goodFile);
}
