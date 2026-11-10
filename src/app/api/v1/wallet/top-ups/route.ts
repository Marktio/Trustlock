import { actingUser, idempotencyKey, json, route } from "@/server/api-v1";
import { amountBody, parseBody } from "@/server/api-contracts";

export const dynamic = "force-dynamic";

/** Adds practice credits to a client's wallet through the simulated gateway. Needs an Idempotency-Key header. */
export const POST = route(async (c) => {
  const { actor } = await actingUser(c);
  const { amount } = await parseBody(c.req, amountBody);
  const balances = await c.svc.topUp(actor, amount, idempotencyKey(c.req));
  return json({ available: balances.available, held: balances.held }, 201);
});
