import { actingUser, ApiError, json, route } from "@/server/api-v1";
import { ACTIONS, requirePlatformContract, serializeView } from "@/server/api-contracts";

export const dynamic = "force-dynamic";

/**
 * Do something to a contract as the user in the TrustLock-User header: accept, reject, counter, accept-counter, decline-counter,
 * cancel, fund, start-work, deliver, request-revision, approve, dispute, withdraw-dispute, cancel-funded, decline-cancel, message.
 * The response is the contract afterwards. fund and approve need an Idempotency-Key header.
 */
export const POST = route<{ id: string; action: string }>(async (c, { id, action }) => {
  const run = Object.hasOwn(ACTIONS, action) ? ACTIONS[action] : undefined;
  if (!run) throw new ApiError(404, "UNKNOWN_ACTION", `Unknown action. Use one of: ${Object.keys(ACTIONS).join(", ")}.`);
  const { actor } = await actingUser(c);
  await requirePlatformContract(c, id);
  await run(c, actor, id);
  return json(serializeView(c.platformId, await c.svc.getContractView(actor, id)));
});
