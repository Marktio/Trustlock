import { json, route } from "@/server/api-v1";
import { serializeDelivery } from "@/server/api-contracts";
import { sendTestEvent } from "@/server/webhooks";
import { ownEndpoint } from "../route";

export const dynamic = "force-dynamic";

/** Sends a "ping" event to the endpoint right now and tells you how it went. */
export const POST = route<{ id: string }>(async (c, { id }) => {
  const endpoint = await ownEndpoint(c, id);
  return json(serializeDelivery(await sendTestEvent({ repo: c.repo, platforms: c.platforms }, endpoint)));
});
