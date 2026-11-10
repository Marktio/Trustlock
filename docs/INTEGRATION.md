# Plugging TrustLock into your app

You keep your own users, orders and UI. TrustLock holds the escrow: the wallet, the rules and the audit trail. Your server talks to it with an API key. Full endpoint list: `docs/API.md`.

```
Your browser/app  ->  YOUR server  ->  TrustLock (/api/v1)
                      holds the key
```

## 1. Get the client

Copy `sdk/trustlock.ts` into your project as `lib/trustlock-client.ts` (one file, no dependencies, Node 18+). Using another language? Skip to "Any other language" below.

```ts
// lib/trustlock.ts
import { TrustLock } from "./trustlock-client";

export const tl = new TrustLock({
  apiKey: process.env.TRUSTLOCK_API_KEY!,       // tlk_..., server only
  baseUrl: process.env.TRUSTLOCK_URL!,          // e.g. https://trustlock-puce.vercel.app
});
```

## 2. Link your users (once per user)

Do it when someone signs up, or lazily the first time they touch escrow. It is safe to repeat.

```ts
await tl.users.upsert({ id: user.id, name: user.name, role: user.isBuyer ? "client" : "freelancer" });
```

`id` is YOUR id for them. You never send passwords or emails. The role cannot change later.

## 3. Everything else runs "as" one of your users

```ts
const buyer = tl.as(order.buyerId);

await buyer.wallet.topUp(500_000, { idempotencyKey: `topup-${payment.id}` }); // 500000 = 5,000.00 credits
const contract = await buyer.contracts.create(
  { freelancer: order.sellerId, title: order.title, description: order.brief, amount: 150_000,
    review_period_days: 3, revision_limit: 1,
    milestones: [{ title: "Delivery", due_date: "2026-12-31", amount: 150_000 }] },
  { idempotencyKey: `create-${order.id}` },   // YOUR order id: a retry can never hire twice
);
await db.orders.update(order.id, { trustlockContractId: contract.id });   // keep the link
```

The call is checked exactly as in the TrustLock app. A seller cannot fund, a buyer cannot accept their own proposal, a stranger gets a 404.

## 4. Drive your buttons from `allowed_actions`

Do not copy the rules into your app. Ask:

```ts
const c = await tl.as(userId).contracts.get(order.trustlockContractId);
// c.state, c.awaiting, c.allowed_actions -> e.g. ["approve", "request-revision", "dispute"]
// Each name is also a method: contracts.approve(id), contracts.requestRevision(id, reason), contracts.dispute(id, reason)
```

## 5. Example: Next.js route handlers in your app

```ts
// app/api/orders/[id]/pay/route.ts  (YOUR app, not TrustLock)
import { tl } from "@/lib/trustlock";
import { TrustLockError } from "@/lib/trustlock-client";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireSignedInUser();                    // YOUR auth
  const order = await db.orders.get(id);
  if (order.buyerId !== user.id) return new Response("Not found", { status: 404 });
  try {
    const c = await tl.as(user.id).contracts.fund(order.trustlockContractId, { idempotencyKey: `fund-${order.id}` });
    return Response.json({ state: c.state });
  } catch (e) {
    if (e instanceof TrustLockError) return Response.json({ error: e.code, message: e.message }, { status: e.status });
    throw e;
  }
}
```

Always check that the signed-in person owns the order **before** calling TrustLock. TrustLock trusts the user id your server sends, so your server is the one that decides who someone is.

## 6. Example: Express

```ts
app.post("/orders/:id/approve", requireLogin, async (req, res) => {
  const order = await db.orders.get(req.params.id);
  if (order.buyerId !== req.user.id) return res.sendStatus(404);
  const c = await tl.as(req.user.id).contracts.approve(order.trustlockContractId, { idempotencyKey: `approve-${order.id}` });
  res.json({ state: c.state });
});
```

## Idempotency keys, in one paragraph

Networks fail halfway. If you retry a "fund" and the first one actually went through, a key makes the second a no-op that returns the same answer. Build keys from your own record (`fund-${order.id}`), not a random value per attempt, so they survive a crash and a restart. The client adds a random key if you forget, but that only protects its own automatic retries. It retries network errors, 429 and 5xx, and only for calls that carry a key (or are reads).

## Try it now

```bash
# TrustLock side: in .env.local set TRUSTLOCK_DEV_API_KEY=tlk_any_long_random_text_here, then
npm run dev
# In another terminal, a whole marketplace flow end to end (signup, hire, fund, deliver, approve):
TRUSTLOCK_API_KEY=tlk_any_long_random_text_here TRUSTLOCK_URL=http://localhost:3000 NODE_NO_WARNINGS=1 node examples/marketplace.ts
```

`examples/marketplace.ts` is the same code as above wired to a fake "Acme Gigs" with its own users and orders.

## Python and PHP

Single files, no dependencies, same shape as the TypeScript client: `sdk/python/trustlock.py` and `sdk/php/TrustLock.php`. Both retry safely (only requests that cannot repeat an effect), raise a typed error with `status` and `code`, and include a webhook signature check. Runnable walk-throughs: `examples/marketplace.py` and `examples/marketplace.php`.

```python
from trustlock import TrustLock, TrustLockError
tl = TrustLock(api_key=os.environ["TRUSTLOCK_API_KEY"], base_url=os.environ["TRUSTLOCK_URL"])
tl.users.upsert("u1", "Amina", "client")
c = tl.as_user("u1").contracts.create({...}, idempotency_key=f"create-{order_id}")
tl.as_user("u1").contracts.fund(c["id"], idempotency_key=f"fund-{order_id}")
```

```php
require 'TrustLock.php';
$tl = new TrustLock\Client(getenv('TRUSTLOCK_API_KEY'), getenv('TRUSTLOCK_URL'));
$tl->users->upsert('u1', 'Amina', 'client');
$c = $tl->as('u1')->contracts->create([...], "create-$orderId");
$tl->as('u1')->contracts->fund($c['id'], "fund-$orderId");
```

Any other language: it is plain JSON over HTTPS (see `docs/API.md`), or generate a client from `GET /api/v1/openapi.json` with openapi-generator.

## Receiving webhooks

Register an endpoint on the `/developers` page (or `tl.webhooks.create(url)`), keep the secret, and check each delivery before trusting it:

```ts
// Next.js route handler in YOUR app
export async function POST(req: Request) {
  const raw = await req.text(); // the raw body, exactly as received
  const event = await verifyWebhook(raw, req.headers.get("trustlock-signature"), process.env.TRUSTLOCK_WEBHOOK_SECRET!);
  if (await alreadyHandled(event.id)) return new Response("ok"); // deliveries can repeat
  if (event.type === "contract.funded") await markOrderPaid(event.data);
  return new Response("ok"); // any 2xx
}
```

Python: `event = verify_webhook(request.get_data(), request.headers.get("TrustLock-Signature"), secret)`. PHP: `$event = TrustLock\Client::verifyWebhook(file_get_contents('php://input'), $_SERVER['HTTP_TRUSTLOCK_SIGNATURE'] ?? null, $secret);`. Use `tl.webhooks.test(id)` to send a ping while you build. Details, events and retry behaviour are in `docs/API.md`.

## Before you go live

- Keep `TRUSTLOCK_API_KEY` in server environment variables only. If it leaks, make a new key and revoke the old one.
- Remember it is a simulation: amounts are practice credits and nothing moves real money.
- Use a test key until it works, then make a live key. The two never see each other's data.
- Use webhooks to learn about changes, and still call `contracts.get()` when a user opens a page. Deduplicate webhooks on the event id.
- Look at the **Recent API calls** table on `/developers` (or `tl.usage()`) when a call fails.
