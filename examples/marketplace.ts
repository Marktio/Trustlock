/**
 * How a marketplace ("Acme Gigs") plugs TrustLock escrow into its OWN users and orders.
 * Acme keeps its own accounts and database. TrustLock only ever sees Acme's user ids and names.
 *
 * Run against a local TrustLock (npm run dev, with TRUSTLOCK_DEV_API_KEY set in .env.local):
 *   TRUSTLOCK_API_KEY=tlk_... TRUSTLOCK_URL=http://localhost:3000 NODE_NO_WARNINGS=1 node examples/marketplace.ts
 */
import { createHash } from "node:crypto";
import { TrustLock, TrustLockError } from "../sdk/trustlock.ts";

const tl = new TrustLock({ apiKey: process.env.TRUSTLOCK_API_KEY ?? "", baseUrl: process.env.TRUSTLOCK_URL ?? "http://localhost:3000" });

// ---- Acme's own data (a real app has a database; these Maps stand in for it) ----
type AcmeUser = { id: string; name: string; email: string; kind: "buyer" | "seller" };
type Order = { id: string; buyer: string; seller: string; title: string; priceMinor: number; trustlockContractId?: string };
const users = new Map<string, AcmeUser>();
const orders = new Map<string, Order>();

// 1. When someone signs up in YOUR app, link them. Run this on signup (and it is safe to run again).
async function onSignup(u: AcmeUser) {
  users.set(u.id, u);
  await tl.users.upsert({ id: u.id, name: u.name, role: u.kind === "buyer" ? "client" : "freelancer" });
}

// 2. Buyer wants to hire a seller. Use YOUR order id in the idempotency key, so a double-click or a retry
//    after a crash can never create two contracts.
async function hire(order: Order) {
  orders.set(order.id, order);
  const contract = await tl.as(order.buyer).contracts.create(
    {
      freelancer: order.seller,
      title: order.title,
      description: `Acme order ${order.id}`,
      amount: order.priceMinor,
      review_period_days: 3,
      revision_limit: 1,
      milestones: [{ title: "Delivery", due_date: "2026-12-31", amount: order.priceMinor }],
    },
    { idempotencyKey: `create-${order.id}` },
  );
  order.trustlockContractId = contract.id; // keep the link in YOUR database
  return contract;
}

// 3. Show the right buttons. TrustLock tells you what this person can do next, so you never re-implement the rules.
async function buttonsFor(order: Order, userId: string) {
  const c = await tl.as(userId).contracts.get(order.trustlockContractId!);
  return { state: c.state, buttons: c.allowed_actions };
}

// 4. Money and delivery steps. Each one is a button handler in your app.
const payIntoEscrow = (o: Order) => tl.as(o.buyer).contracts.fund(o.trustlockContractId!, { idempotencyKey: `fund-${o.id}` });
const approveWork = (o: Order) => tl.as(o.buyer).contracts.approve(o.trustlockContractId!, { idempotencyKey: `approve-${o.id}` });

async function main() {
  const step = (s: string) => console.log(`\n== ${s}`);

  step("Sign-ups in Acme are linked to TrustLock");
  await onSignup({ id: "acme-user-42", name: "Amina Wanjiru", email: "amina@acme.example", kind: "buyer" });
  await onSignup({ id: "acme-user-77", name: "Brian Otieno", email: "brian@acme.example", kind: "seller" });

  step("Buyer adds practice credits, then hires the seller");
  await tl.as("acme-user-42").wallet.topUp(500_000, { idempotencyKey: "topup-demo-1" });
  const order: Order = { id: "ord_1001", buyer: "acme-user-42", seller: "acme-user-77", title: "Logo for Acme Cafe", priceMinor: 150_000 };
  const first = await hire(order);
  const again = await hire(order); // a retry: returns the SAME contract
  console.log(`contract ${first.ref} is ${first.state}; retry gave the same one: ${first.id === again.id}`);

  step("What each person can do now");
  console.log("seller:", await buttonsFor(order, order.seller));

  step("Seller accepts, buyer pays into escrow");
  await tl.as(order.seller).contracts.accept(order.trustlockContractId!);
  console.log("after funding:", (await payIntoEscrow(order)).state, "| buyer wallet:", await tl.as(order.buyer).wallet.get().then(({ available, held }) => ({ available, held })));

  step("Seller works and delivers (the file stays on Acme's storage; TrustLock records its fingerprint)");
  const file = Buffer.from("final-logo.zip contents");
  await tl.as(order.seller).contracts.startWork(order.trustlockContractId!);
  const delivered = await tl.as(order.seller).contracts.deliver(order.trustlockContractId!, { file_name: "final-logo.zip", size_bytes: file.length, sha256: createHash("sha256").update(file).digest("hex") });
  console.log("state:", delivered.state, "| buyer can:", (await buttonsFor(order, order.buyer)).buttons);

  step("Buyer approves, escrow is released to the seller");
  const done = await approveWork(order);
  console.log("state:", done.state, "| seller wallet:", await tl.as(order.seller).wallet.get().then(({ available, held }) => ({ available, held })));

  step("Errors arrive as typed objects");
  try {
    await tl.as(order.seller).contracts.approve(order.trustlockContractId!);
  } catch (e) {
    if (e instanceof TrustLockError) console.log(`${e.status} ${e.code}: ${e.message}`);
    else throw e;
  }
}

main().catch((e) => {
  console.error(e instanceof TrustLockError ? `TrustLock said ${e.status} ${e.code}: ${e.message}` : e);
  process.exit(1);
});
