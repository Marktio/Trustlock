import { walletAvailable } from "@/domain/ledger";
import { actingUser, json, route } from "@/server/api-v1";

export const dynamic = "force-dynamic";

/** Balances and the last 100 ledger entries for the user named in the TrustLock-User header. */
export const GET = route(async (c) => {
  const { actor, user } = await actingUser(c);
  const { balances, entries } = await c.svc.getWallet(actor);
  return json({
    available: balances.available,
    held: balances.held,
    entries: entries.slice(0, 100).map((e) => ({
      tx_id: e.txId,
      balance: e.account === walletAvailable(user.id) ? "available" : "held",
      amount: e.delta,
      memo: e.memo,
      contract_id: e.contractId,
      created_at: e.createdAt,
    })),
  });
});
