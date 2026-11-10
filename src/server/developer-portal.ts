import { generateApiKey, namespaceOf, newPlatformId, newWebhookSecret, type ApiKeyRecord, type KeyMode, type PlatformRepository, type RequestLog, type WebhookEndpoint } from "./platform";
import { MAX_ENDPOINTS, assertSafeWebhookUrl } from "./webhooks";
import { ApiError } from "./api-v1";
import { randomUUID } from "node:crypto";

/**
 * What the /developers page does, kept out of the page so it can be tested without a browser.
 * A person's keys, webhook endpoints and API log are theirs alone: every function checks the owner.
 */

export const MAX_ACTIVE_KEYS = 5;

export class PortalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortalError";
  }
}

const active = (k: ApiKeyRecord) => !k.revokedAt;

export async function createKeyFor(platforms: PlatformRepository, ownerId: string, labelRaw: string, mode: KeyMode) {
  const label = labelRaw.trim();
  if (label.length < 1 || label.length > 80) throw new PortalError("Give the key a name of 1 to 80 characters.");
  if (mode !== "test" && mode !== "live") throw new PortalError("Choose test or live.");
  const mine = await platforms.listKeysByOwner(ownerId);
  if (mine.filter(active).length >= MAX_ACTIVE_KEYS) throw new PortalError(`You can have up to ${MAX_ACTIVE_KEYS} active keys. Revoke one first.`);
  // One platform per person: their test and live keys share an id, and their namespaces differ only by mode.
  const generated = generateApiKey(label, { platformId: mine[0]?.platformId ?? newPlatformId(), mode, ownerId });
  await platforms.insertKey(generated.record);
  return generated;
}

export async function revokeKeyFor(platforms: PlatformRepository, ownerId: string, keyId: string) {
  const key = await platforms.getKey(keyId);
  if (!key || key.ownerId !== ownerId) throw new PortalError("We could not find that key.");
  await platforms.revokeKey(key.id, new Date().toISOString());
}

/** The namespaces this person owns, with their mode. A person who has made no key yet owns none. */
async function namespacesOf(platforms: PlatformRepository, ownerId: string) {
  const keys = await platforms.listKeysByOwner(ownerId);
  const platformId = keys[0]?.platformId;
  return platformId ? ([["live", namespaceOf({ platformId, mode: "live" })], ["test", namespaceOf({ platformId, mode: "test" })]] as const) : ([] as const);
}

export async function addEndpointFor(platforms: PlatformRepository, ownerId: string, urlRaw: string, mode: KeyMode) {
  const spaces = await namespacesOf(platforms, ownerId);
  const ns = spaces.find(([m]) => m === mode)?.[1];
  if (!ns) throw new PortalError("Make an API key first. Webhooks belong to your keys' environment.");
  let url: URL;
  try {
    url = assertSafeWebhookUrl(urlRaw.trim());
  } catch (e) {
    throw new PortalError(e instanceof ApiError ? e.message : "That address cannot be used.");
  }
  if ((await platforms.listEndpoints(ns)).length >= MAX_ENDPOINTS) throw new PortalError(`You can have up to ${MAX_ENDPOINTS} webhook endpoints in each environment. Remove one first.`);
  const endpoint: WebhookEndpoint = { id: randomUUID(), namespace: ns, url: url.toString(), secret: newWebhookSecret(), events: ["*"], enabled: true, createdAt: new Date().toISOString() };
  await platforms.insertEndpoint(endpoint);
  return endpoint;
}

/** Returns the endpoint only when it belongs to this person. */
export async function ownEndpointFor(platforms: PlatformRepository, ownerId: string, endpointId: string): Promise<WebhookEndpoint> {
  const spaces = (await namespacesOf(platforms, ownerId)).map(([, ns]) => ns);
  const endpoint = await platforms.getEndpoint(endpointId);
  if (!endpoint || !spaces.includes(endpoint.namespace)) throw new PortalError("We could not find that webhook endpoint.");
  return endpoint;
}

export async function removeEndpointFor(platforms: PlatformRepository, ownerId: string, endpointId: string) {
  await platforms.deleteEndpoint((await ownEndpointFor(platforms, ownerId, endpointId)).id);
}

export interface PortalOverview {
  keys: ApiKeyRecord[];
  endpoints: (Omit<WebhookEndpoint, "secret"> & { mode: KeyMode })[];
  calls: (RequestLog & { mode: KeyMode })[];
}

export async function overviewFor(platforms: PlatformRepository, ownerId: string): Promise<PortalOverview> {
  const keys = await platforms.listKeysByOwner(ownerId);
  const spaces = await namespacesOf(platforms, ownerId);
  const endpoints: PortalOverview["endpoints"] = [];
  const calls: PortalOverview["calls"] = [];
  for (const [mode, ns] of spaces) {
    for (const { secret: _secret, ...e } of await platforms.listEndpoints(ns)) endpoints.push({ ...e, mode });
    for (const l of await platforms.listLogs(ns, 20)) calls.push({ ...l, mode });
  }
  calls.sort((a, b) => b.at.localeCompare(a.at));
  return { keys, endpoints, calls: calls.slice(0, 20) };
}
