import { createHmac, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { parseAudit, type ParsedAudit } from "@/domain/audit";
import { EVIDENCE_ACTION } from "@/domain/derived";
import { MESSAGE_ACTION } from "@/domain/escrow-service";
import type { EscrowRepository } from "@/domain/repository";
import { CONTRACT_STATES } from "@/domain/states";
import { serializeContract } from "./api-contracts";
import { ApiError } from "./api-v1";
import { namespaceFromUserId, type PlatformRepository, type WebhookDelivery, type WebhookEndpoint } from "./platform";

/**
 * Webhooks: TrustLock tells your server when a contract changes, so you do not have to poll.
 *
 * How it works (and why it cannot miss or double-send):
 *  1. Every change already lands in the append-only audit log. A scanner reads the entries it has not seen (a cursor remembers where it stopped),
 *     turns the ones that mean something to a platform into events, and queues one delivery per matching endpoint.
 *     The queue has a unique key on (endpoint, event), so reading an entry twice never queues it twice.
 *  2. Deliveries are signed with the endpoint's secret and sent. With QSTASH_TOKEN set they go through Upstash QStash, which keeps retrying for hours.
 *     Without it they are sent directly with a few retries spaced out over a day, picked up whenever the scanner next runs.
 *  3. The scanner runs after every committed change (so events leave within moments) and from the cron route (so retries and anything missed still go out).
 */

export const WEBHOOK_EVENTS = [
  ...CONTRACT_STATES.filter((s) => s !== "draft").map((s) => `contract.${s}`),
  "contract.message",
  "dispute.evidence_submitted",
  "ping",
] as const;

export const MAX_ENDPOINTS = 5;
const CURSOR = "webhook-audit";
const SCAN_BATCH = 500;
/** Wait after the 1st, 2nd, ... failed attempt. After the last one the delivery is marked failed. */
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000];
const SEND_TIMEOUT_MS = 8000;

// ---------- Which audit entries become events ----------

/** The event a platform should hear about for one audit entry, or null when it is internal (a wallet entry, a terms edit, a verification). */
export function eventTypeOf(a: ParsedAudit): string | null {
  if (a.targetType !== "contract" || a.result !== "ok") return null;
  if (a.action === MESSAGE_ACTION) return "contract.message";
  if (a.action === EVIDENCE_ACTION) return "dispute.evidence_submitted";
  const to = (a.after as { state?: unknown } | null | undefined)?.state;
  const from = (a.before as { state?: unknown } | null | undefined)?.state;
  if (typeof to !== "string" || to === from || !(CONTRACT_STATES as readonly string[]).includes(to) || to === "draft") return null;
  return `contract.${to}`;
}

export const eventMatches = (subscribed: readonly string[], type: string) => subscribed.includes("*") || subscribed.includes(type);

// ---------- Safe destinations ----------

const bad = (message: string) => new ApiError(422, "INVALID_URL", message);

export function isPrivateIp(ip: string): boolean {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const x = ip.toLowerCase();
  return x === "::" || x === "::1" || x.startsWith("fc") || x.startsWith("fd") || /^fe[89ab]/.test(x);
}

const devLocal = (host: string) => process.env.NODE_ENV !== "production" && (host === "localhost" || host === "127.0.0.1" || host === "[::1]");

/** Webhook URLs must be https and point at the public internet, so TrustLock can never be aimed at its own network. */
export function assertSafeWebhookUrl(raw: unknown): URL {
  if (typeof raw !== "string" || raw.length > 500) throw bad("The url must be text of at most 500 characters.");
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw bad("The url is not a valid web address.");
  }
  const host = u.hostname.toLowerCase();
  if (devLocal(host)) return u;
  if (u.protocol !== "https:") throw bad("The url must start with https://");
  if (u.username || u.password) throw bad("The url must not contain a username or password.");
  const bare = host.replace(/^\[|\]$/g, "");
  if (host === "localhost" || /\.(local|localhost|internal|localdomain|lan)$/.test(host) || (isIP(bare) !== 0 && isPrivateIp(bare)) || !host.includes(".") && isIP(bare) === 0) {
    throw bad("The url must point to a public address, not to a private or local one.");
  }
  return u;
}

async function assertResolvesPublic(u: URL): Promise<void> {
  if (devLocal(u.hostname.toLowerCase())) return;
  const bare = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(bare) !== 0) return; // already checked as a literal
  const found = await lookup(bare, { all: true });
  if (found.length === 0 || found.some((f) => isPrivateIp(f.address))) throw new Error("The address resolves to a private network");
}

// ---------- Signing ----------

/** `TrustLock-Signature: t=<unix seconds>,v1=<hex>`, where v1 = HMAC-SHA256(secret, `${t}.${body}`). */
export function signPayload(secret: string, body: string, t: number = Math.floor(Date.now() / 1000)): string {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
}

// ---------- Scanning ----------

export interface Deps {
  repo: EscrowRepository;
  platforms: PlatformRepository;
  fetcher?: typeof fetch;
}

export async function scanEvents({ repo, platforms }: Deps, limit = SCAN_BATCH): Promise<number> {
  const cursor = await platforms.getCursor(CURSOR);
  if ((await repo.getAuditHead()).count <= cursor) return 0;
  const entries = (await repo.listAudit()).filter((e) => e.seq > cursor).slice(0, limit);
  const endpoints = new Map<string, WebhookEndpoint[]>();
  let queued = 0;
  let last = cursor;

  for (const stored of entries) {
    const a = parseAudit(stored);
    last = a.seq;
    const type = eventTypeOf(a);
    if (!type) continue;
    const contract = await repo.getContract(a.targetId);
    const ns = contract && namespaceFromUserId(contract.clientId);
    if (!contract || !ns || namespaceFromUserId(contract.freelancerId) !== ns) continue;
    if (!endpoints.has(ns)) endpoints.set(ns, await platforms.listEndpoints(ns));

    for (const e of endpoints.get(ns)!) {
      // A new endpoint hears about what happens from now on, never about its platform's history.
      if (!e.enabled || !eventMatches(e.events, type) || a.at < e.createdAt) continue;
      const eventId = `evt_${a.seq}`;
      const payload = JSON.stringify({
        id: eventId,
        type,
        created_at: a.at,
        data: { state: (a.after as { state?: string } | null)?.state ?? null, previous_state: (a.before as { state?: string } | null)?.state ?? null, contract: serializeContract(ns, contract) },
      });
      const ok = await platforms.insertDelivery(newDelivery(e, eventId, type, payload, a.at));
      if (ok) queued++;
    }
  }
  if (last > cursor) await platforms.setCursor(CURSOR, last);
  return queued;
}

const newDelivery = (e: WebhookEndpoint, eventId: string, type: string, payload: string, at: string): WebhookDelivery => ({
  id: randomUUID(), endpointId: e.id, namespace: e.namespace, eventId, type, payload, status: "pending", attempts: 0,
  nextAttemptAt: at, lastStatus: null, lastError: null, createdAt: at, deliveredAt: null,
});

// ---------- Sending ----------

const qstashConfigured = () => Boolean(process.env.QSTASH_TOKEN);

async function send(endpoint: WebhookEndpoint, d: WebhookDelivery, fetcher: typeof fetch): Promise<{ status: number }> {
  const signature = signPayload(endpoint.secret, d.payload);
  const meta = { "TrustLock-Signature": signature, "TrustLock-Event-Id": d.eventId, "TrustLock-Event-Type": d.type, "User-Agent": "TrustLock-Webhooks/1" };

  if (qstashConfigured()) {
    // QStash makes the call and keeps retrying, so one hand-over is all we do. Its own copy of the event is deduplicated by id.
    const base = (process.env.QSTASH_URL ?? "https://qstash.upstash.io").replace(/\/+$/, "");
    const res = await fetcher(`${base}/v2/publish/${endpoint.url}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.QSTASH_TOKEN}`,
        "Content-Type": "application/json",
        "Upstash-Method": "POST",
        "Upstash-Retries": "6",
        "Upstash-Deduplication-Id": `${endpoint.id}-${d.eventId}`,
        ...Object.fromEntries(Object.entries(meta).map(([k, v]) => [`Upstash-Forward-${k}`, v])),
      },
      body: d.payload,
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    return { status: res.status };
  }

  const url = assertSafeWebhookUrl(endpoint.url);
  await assertResolvesPublic(url);
  const res = await fetcher(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...meta },
    body: d.payload,
    redirect: "manual", // a redirect could point somewhere private
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  return { status: res.status };
}

/** One attempt. Records the outcome and, on failure, when to try again. */
export async function attempt(deps: Deps, d: WebhookDelivery, now: Date = new Date()): Promise<WebhookDelivery> {
  const { platforms, fetcher = fetch } = deps;
  const endpoint = await platforms.getEndpoint(d.endpointId);
  const attempts = d.attempts + 1;
  let patch: Parameters<PlatformRepository["updateDelivery"]>[1];

  if (!endpoint || !endpoint.enabled) {
    patch = { status: "failed", attempts, lastError: "The endpoint was removed or turned off." };
  } else {
    try {
      const { status } = await send(endpoint, d, fetcher);
      if (status >= 200 && status < 300) patch = { status: "delivered", attempts, lastStatus: status, lastError: null, deliveredAt: now.toISOString() };
      else patch = failure(attempts, now, status, `Your server answered ${status}.`);
    } catch (e) {
      patch = failure(attempts, now, null, e instanceof Error ? e.message.slice(0, 200) : "The request failed.");
    }
  }
  await platforms.updateDelivery(d.id, patch);
  return { ...d, ...patch } as WebhookDelivery;
}

function failure(attempts: number, now: Date, status: number | null, error: string): Parameters<PlatformRepository["updateDelivery"]>[1] {
  const wait = BACKOFF_MS[attempts - 1];
  return wait === undefined
    ? { status: "failed", attempts, lastStatus: status, lastError: error }
    : { attempts, lastStatus: status, lastError: error, nextAttemptAt: new Date(now.getTime() + wait).toISOString() };
}

export async function deliverDue(deps: Deps, now: Date = new Date(), limit = 50): Promise<number> {
  const due = await deps.platforms.listDueDeliveries(now.toISOString(), limit);
  for (const d of due) await attempt(deps, d, now);
  return due.length;
}

/** Queues a "ping" for one endpoint and sends it now, so a developer can check their server and signature check work. */
export async function sendTestEvent(deps: Deps, endpoint: WebhookEndpoint, now: Date = new Date()): Promise<WebhookDelivery> {
  const eventId = `evt_test_${randomUUID()}`;
  const payload = JSON.stringify({ id: eventId, type: "ping", created_at: now.toISOString(), data: { message: "This is a test from TrustLock." } });
  const d = newDelivery(endpoint, eventId, "ping", payload, now.toISOString());
  await deps.platforms.insertDelivery(d);
  return attempt(deps, d, now);
}

// ---------- Running it ----------

let running: Promise<void> | null = null;
let again = false;

/** Scans, then sends what is due. One run at a time per instance; a request that arrives during a run asks for one more pass. */
export async function processWebhooks(deps: Deps, now?: Date): Promise<{ queued: number; attempted: number }> {
  if (running) {
    again = true;
    await running;
    return { queued: 0, attempted: 0 };
  }
  const result = { queued: 0, attempted: 0 };
  running = (async () => {
    do {
      again = false;
      result.queued += await scanEvents(deps);
      result.attempted += await deliverDue(deps, now ?? new Date()); // the clock is read on every pass: events queued during a pass are due on the next
    } while (again);
  })().finally(() => {
    running = null;
  });
  await running;
  return result;
}
