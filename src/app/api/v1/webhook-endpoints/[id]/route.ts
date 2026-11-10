import { ApiError, json, route } from "@/server/api-v1";
import { serializeDelivery, serializeEndpoint } from "@/server/api-contracts";
import type { ApiContext } from "@/server/api-v1";

export const dynamic = "force-dynamic";

export async function ownEndpoint(c: ApiContext, id: string) {
  const endpoint = await c.platforms.getEndpoint(id);
  if (!endpoint || endpoint.namespace !== c.platformId) throw new ApiError(404, "NOT_FOUND", "We could not find that webhook endpoint.");
  return endpoint;
}

/** The endpoint and its 20 most recent deliveries: what was sent, how many tries, and why one failed. */
export const GET = route<{ id: string }>(async (c, { id }) => {
  const endpoint = await ownEndpoint(c, id);
  const deliveries = await c.platforms.listDeliveries(endpoint.id, 20);
  return json({ ...serializeEndpoint(endpoint), deliveries: deliveries.map(serializeDelivery) });
});

export const DELETE = route<{ id: string }>(async (c, { id }) => {
  const endpoint = await ownEndpoint(c, id);
  await c.platforms.deleteEndpoint(endpoint.id);
  return json({ deleted: true });
});
