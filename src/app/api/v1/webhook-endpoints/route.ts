import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError, json, readJson, route } from "@/server/api-v1";
import { newWebhookSecret } from "@/server/platform";
import { MAX_ENDPOINTS, WEBHOOK_EVENTS, assertSafeWebhookUrl } from "@/server/webhooks";
import { serializeEndpoint } from "@/server/api-contracts";

export const dynamic = "force-dynamic";

const body = z.object({
  url: z.string(),
  events: z.array(z.enum(["*", ...WEBHOOK_EVENTS], { message: `Unknown event. Use * or one of: ${WEBHOOK_EVENTS.join(", ")}` })).min(1).max(30).optional(),
});

/**
 * Tell TrustLock where to send events. The response includes the signing `secret` ONCE: keep it, it is how you check that
 * a delivery really came from TrustLock. Your key's mode (test or live) decides which set of events the endpoint hears.
 */
export const POST = route(async (c) => {
  const input = body.parse(await readJson(c.req));
  const url = assertSafeWebhookUrl(input.url);
  if ((await c.platforms.listEndpoints(c.platformId)).length >= MAX_ENDPOINTS) throw new ApiError(409, "LIMIT", `You can have up to ${MAX_ENDPOINTS} webhook endpoints. Remove one first.`);
  const endpoint = {
    id: randomUUID(),
    namespace: c.platformId,
    url: url.toString(),
    secret: newWebhookSecret(),
    events: [...new Set(input.events ?? ["*"])],
    enabled: true,
    createdAt: new Date().toISOString(),
  };
  await c.platforms.insertEndpoint(endpoint);
  return json({ ...serializeEndpoint(endpoint), secret: endpoint.secret }, 201);
});

export const GET = route(async (c) => json({ data: (await c.platforms.listEndpoints(c.platformId)).map(serializeEndpoint) }));
