import { actingUser, json, route } from "@/server/api-v1";
import { requirePlatformContract, serializeView } from "@/server/api-contracts";

export const dynamic = "force-dynamic";

/** One contract with what the user can do next (allowed_actions), whose turn it is, the timeline and the messages. */
export const GET = route<{ id: string }>(async (c, { id }) => {
  const { actor } = await actingUser(c);
  await requirePlatformContract(c, id);
  return json(serializeView(c.platformId, await c.svc.getContractView(actor, id)));
});
