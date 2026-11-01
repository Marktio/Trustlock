import type { EscrowService } from "@/domain/escrow-service";
import type { EscrowRepository } from "@/domain/repository";
import type { Actor, User } from "@/domain/types";

/** Demo accounts. Used only when Clerk keys are absent, so the app can run and be demonstrated locally. */
export const DEMO_USERS: User[] = [
  { id: "demo_amina", name: "Amina Wanjiru", email: "amina@example.com", role: "client" },
  { id: "demo_brian", name: "Brian Otieno", email: "brian@example.com", role: "freelancer" },
  { id: "demo_sheila", name: "Sheila Njeri", email: "sheila@example.com", role: "freelancer" },
  { id: "demo_kevin", name: "Kevin Mwangi", email: "kevin@example.com", role: "freelancer" },
  { id: "demo_grace", name: "Grace Mutua", email: "grace@example.com", role: "arbitrator" },
  { id: "demo_daniel", name: "Daniel Kiprop", email: "daniel@example.com", role: "admin" },
  { id: "demo_faith", name: "Faith Achieng", email: "faith@example.com", role: "auditor" },
];

const actor = (id: string): Actor => ({ id, role: DEMO_USERS.find((u) => u.id === id)!.role });

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** Puts demo data through the real service, so the ledger and audit log are consistent from the first request. */
export async function seedDemo(svc: EscrowService, repo: EscrowRepository) {
  // Claim the seed first. The claim is atomic in the database, so if two requests start at once only one of them seeds.
  const claim = await repo.commit({
    idempotencyKey: "seed-demo-claim",
    audit: [{ actorId: null, actorRole: "system", action: "demo.seed", targetType: "system", targetId: "demo", result: "ok" }],
  });
  if (claim.replayed) return;
  for (const u of DEMO_USERS) await repo.upsertUser(u);
  const amina = actor("demo_amina");

  await svc.topUp(amina, 100_000 * 100, "seed-topup-0001");
  await svc.topUp(amina, 45_500 * 100, "seed-topup-0002");

  // 1. Funded and in progress.
  const brand = await svc.createContract(amina, {
    title: "Brand identity refresh",
    description: "Logo, colour palette and a short brand guide.",
    freelancerEmail: "brian@example.com",
    totalSC: "45000",
    reviewPeriodDays: 3,
    revisionLimit: 2,
    milestones: [
      { title: "Logo concepts (3 directions)", dueDate: inDays(10), amountSC: "15000" },
      { title: "Chosen logo, refined", dueDate: inDays(18), amountSC: "15000" },
      { title: "Brand guide PDF", dueDate: inDays(28), amountSC: "15000" },
    ],
  });
  await svc.accept(actor("demo_brian"), brand.id);
  await svc.fund(amina, brand.id, "seed-fund-0001");
  await svc.startWork(actor("demo_brian"), brand.id);

  // 2. Delivered, waiting for the client's review.
  const copy = await svc.createContract(amina, {
    title: "Website copywriting",
    description: "Six pages of website copy in our brand voice.",
    freelancerEmail: "sheila@example.com",
    totalSC: "18500",
    reviewPeriodDays: 3,
    revisionLimit: 2,
    milestones: [{ title: "All six pages", dueDate: inDays(5), amountSC: "18500" }],
  });
  await svc.accept(actor("demo_sheila"), copy.id);
  await svc.fund(amina, copy.id, "seed-fund-0002");
  await svc.startWork(actor("demo_sheila"), copy.id);
  await svc.deliver(actor("demo_sheila"), copy.id, {
    fileName: "website-copy-final.docx",
    sizeBytes: 1_258_291,
    sha256: "c41a90de7b3f52a61e08d94c77b0f1a2e3d5b6c7a8f9012345678901234abcde".slice(0, 64),
    note: "All 6 pages included, tone matches your brand guide.",
  });

  // 3. Waiting for the freelancer to reply.
  await svc.createContract(amina, {
    title: "Product photos (20)",
    description: "Twenty product photos on a plain background.",
    freelancerEmail: "kevin@example.com",
    totalSC: "12000",
    reviewPeriodDays: 3,
    revisionLimit: 1,
    milestones: [{ title: "Twenty edited photos", dueDate: inDays(14), amountSC: "12000" }],
  });

  // 4. Disputed, then settled by the arbitrator. Part of the money went back to the client.
  const logo = await svc.createContract(amina, {
    title: "Logo animation",
    description: "A ten second animated version of the logo.",
    freelancerEmail: "brian@example.com",
    totalSC: "10000",
    reviewPeriodDays: 3,
    revisionLimit: 1,
    milestones: [{ title: "Animated logo, 10 seconds", dueDate: inDays(2), amountSC: "10000" }],
  });
  await svc.accept(actor("demo_brian"), logo.id);
  await svc.fund(amina, logo.id, "seed-fund-0003");
  await svc.startWork(actor("demo_brian"), logo.id);
  await svc.deliver(actor("demo_brian"), logo.id, {
    fileName: "logo-animation.zip",
    sizeBytes: 8_388_608,
    sha256: "9f2b7c1d4e6a8035b1c2d3e4f5a6978899aabbccddeeff00112233445566778a".slice(0, 64),
    note: "Ten seconds, 1080p, exported as a zip.",
  });
  await svc.raiseDispute(amina, logo.id, "The animation is 6 seconds long, not the 10 we agreed.");
  await svc.submitEvidence(amina, logo.id, { text: "The brief said 10 seconds. The file I received runs for 6.", files: [] });
  await svc.submitEvidence(actor("demo_brian"), logo.id, { text: "The client approved the storyboard, which showed 6 seconds.", files: [] });
  await svc.assignArbitrator(actor("demo_daniel"), logo.id, "demo_grace");
  await svc.resolveDispute(actor("demo_grace"), logo.id, {
    decision: "split",
    freelancerPercent: 70,
    note: "The file is shorter than agreed but usable. Seventy percent to the freelancer.",
  });
}
