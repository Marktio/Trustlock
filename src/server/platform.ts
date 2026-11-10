import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { SupabasePlatformRepository } from "./supabase-platform-repository";
import { freshFetch, supabaseSettings } from "./container";

/**
 * Developer platforms. A "platform" is an outside app that calls TrustLock from its own server with an API key
 * and tells us which of ITS users is acting. We never see those users' passwords or emails: each one becomes an escrow user whose id
 * is namespaced by the platform, so two platforms can never reach each other's people, wallets or contracts.
 *
 * Every key is "test" or "live". Each mode is its own namespace (`<platform>` and `<platform>-test`), so a developer's staging
 * users, contracts, webhooks and logs can never mix with production ones. Test keys can also ask for simulated gateway failures.
 */

export const KEY_PREFIX = "tlk_";
export const PLATFORM_ID = /^[a-z0-9]{12}$/;
/** What a platform may call its own users. Kept narrow so it is safe inside an id, a URL and a log line. */
export const EXTERNAL_ID = /^[A-Za-z0-9._:@-]{1,64}$/;

export type KeyMode = "test" | "live";

export interface ApiKeyRecord {
  id: string;
  platformId: string;
  mode: KeyMode;
  /** The TrustLock account that made the key on the /developers page. Null for keys made with the script. */
  ownerId: string | null;
  label: string;
  /** First characters of the key, so a person can tell keys apart in a list. The key itself is never stored. */
  prefix: string;
  keyHash: string;
  createdAt: string;
  revokedAt: string | null;
}

/** Everything a platform owns lives under this name: users, contracts, webhooks and logs. */
export const namespaceOf = (k: Pick<ApiKeyRecord, "platformId" | "mode">): string => (k.mode === "test" ? `${k.platformId}-test` : k.platformId);

export interface WebhookEndpoint {
  id: string;
  namespace: string;
  url: string;
  /** Used to sign each delivery. Shown to the developer once, when the endpoint is made. */
  secret: string;
  /** Event types to send, or ["*"] for all. */
  events: string[];
  enabled: boolean;
  createdAt: string;
}

export type DeliveryStatus = "pending" | "delivered" | "failed";

export interface WebhookDelivery {
  id: string;
  endpointId: string;
  namespace: string;
  eventId: string;
  type: string;
  payload: string;
  status: DeliveryStatus;
  attempts: number;
  nextAttemptAt: string;
  lastStatus: number | null;
  lastError: string | null;
  createdAt: string;
  deliveredAt: string | null;
}

export interface RequestLog {
  id: string;
  namespace: string;
  keyId: string;
  method: string;
  path: string;
  status: number;
  /** The error code when the call failed, such as INSUFFICIENT_FUNDS. */
  code: string | null;
  ms: number;
  at: string;
}

export interface PlatformRepository {
  insertKey(record: ApiKeyRecord): Promise<void>;
  findKeyByHash(keyHash: string): Promise<ApiKeyRecord | null>;
  listKeys(platformId: string): Promise<ApiKeyRecord[]>;
  listKeysByOwner(ownerId: string): Promise<ApiKeyRecord[]>;
  getKey(id: string): Promise<ApiKeyRecord | null>;
  revokeKey(id: string, at: string): Promise<void>;

  insertEndpoint(e: WebhookEndpoint): Promise<void>;
  listEndpoints(namespace: string): Promise<WebhookEndpoint[]>;
  getEndpoint(id: string): Promise<WebhookEndpoint | null>;
  deleteEndpoint(id: string): Promise<void>;

  /** Returns false when this endpoint already has this event (so a repeated scan never sends twice). */
  insertDelivery(d: WebhookDelivery): Promise<boolean>;
  listDueDeliveries(nowIso: string, limit: number): Promise<WebhookDelivery[]>;
  listDeliveries(endpointId: string, limit: number): Promise<WebhookDelivery[]>;
  updateDelivery(id: string, patch: Partial<Pick<WebhookDelivery, "status" | "attempts" | "nextAttemptAt" | "lastStatus" | "lastError" | "deliveredAt">>): Promise<void>;

  /** How far the webhook scanner has read in the audit log. */
  getCursor(name: string): Promise<number>;
  setCursor(name: string, value: number): Promise<void>;

  insertLog(l: RequestLog): Promise<void>;
  listLogs(namespace: string, limit: number): Promise<RequestLog[]>;
  pruneLogs(beforeIso: string): Promise<void>;
}

/** Keys are 256 random bits, so a plain SHA-256 is enough to store them safely: there is nothing to brute-force. */
export const hashKey = (key: string): string => createHash("sha256").update(key).digest("hex");

export function newPlatformId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(randomBytes(12), (b) => alphabet[b % alphabet.length]).join("");
}

/** The secret is returned once, to be shown to the developer. Only the record (with the hash) is saved. */
export function generateApiKey(
  label: string,
  o: { platformId?: string; mode?: KeyMode; ownerId?: string | null; now?: Date } = {},
): { secret: string; record: ApiKeyRecord } {
  const mode = o.mode ?? "live";
  const secret = `${KEY_PREFIX}${mode}_${randomBytes(32).toString("base64url")}`;
  return {
    secret,
    record: {
      id: randomUUID(),
      platformId: o.platformId ?? newPlatformId(),
      mode,
      ownerId: o.ownerId ?? null,
      label: label.trim().slice(0, 80) || "API key",
      prefix: secret.slice(0, 13),
      keyHash: hashKey(secret),
      createdAt: (o.now ?? new Date()).toISOString(),
      revokedAt: null,
    },
  };
}

export const newWebhookSecret = (): string => `whsec_${randomBytes(24).toString("base64url")}`;

export const userIdFor = (namespace: string, externalId: string): string => `x_${namespace}_${externalId}`;

/**
 * Profiles need a unique email, but platform users do not have one with us: an address that can never receive mail, unique per
 * platform and user. Hashed, so any characters in the id are safe, and no person from the web app can ever be matched to it.
 */
export const placeholderEmail = (namespace: string, externalId: string): string =>
  `u-${createHash("sha256").update(externalId).digest("hex").slice(0, 24)}@${namespace}.users.trustlock.invalid`;

/** The platform's own id for a TrustLock user, or null when that user belongs to someone else. */
export function externalIdOf(namespace: string, userId: string): string | null {
  const prefix = `x_${namespace}_`;
  return userId.startsWith(prefix) ? userId.slice(prefix.length) : null;
}

/** Which namespace a TrustLock user id belongs to, or null for people who are not platform users. */
export function namespaceFromUserId(userId: string): string | null {
  const m = /^x_([a-z0-9]{12}(?:-test)?)_/.exec(userId);
  return m ? m[1] : null;
}

export class MemoryPlatformRepository implements PlatformRepository {
  private keys = new Map<string, ApiKeyRecord>();
  private endpoints = new Map<string, WebhookEndpoint>();
  private deliveries = new Map<string, WebhookDelivery>();
  private cursors = new Map<string, number>();
  private logs: RequestLog[] = [];

  async insertKey(record: ApiKeyRecord) {
    this.keys.set(record.id, { ...record });
  }
  async findKeyByHash(keyHash: string) {
    const found = [...this.keys.values()].find((k) => k.keyHash === keyHash);
    return found ? { ...found } : null;
  }
  async listKeys(platformId: string) {
    return [...this.keys.values()].filter((k) => k.platformId === platformId).map((k) => ({ ...k }));
  }
  async listKeysByOwner(ownerId: string) {
    return [...this.keys.values()].filter((k) => k.ownerId === ownerId).map((k) => ({ ...k }));
  }
  async getKey(id: string) {
    const k = this.keys.get(id);
    return k ? { ...k } : null;
  }
  async revokeKey(id: string, at: string) {
    const k = this.keys.get(id);
    if (k && !k.revokedAt) k.revokedAt = at;
  }

  async insertEndpoint(e: WebhookEndpoint) {
    this.endpoints.set(e.id, { ...e, events: [...e.events] });
  }
  async listEndpoints(namespace: string) {
    return [...this.endpoints.values()].filter((e) => e.namespace === namespace).map((e) => ({ ...e, events: [...e.events] }));
  }
  async getEndpoint(id: string) {
    const e = this.endpoints.get(id);
    return e ? { ...e, events: [...e.events] } : null;
  }
  async deleteEndpoint(id: string) {
    this.endpoints.delete(id);
    for (const [k, d] of this.deliveries) if (d.endpointId === id) this.deliveries.delete(k);
  }

  async insertDelivery(d: WebhookDelivery) {
    if ([...this.deliveries.values()].some((x) => x.endpointId === d.endpointId && x.eventId === d.eventId)) return false;
    this.deliveries.set(d.id, { ...d });
    return true;
  }
  async listDueDeliveries(nowIso: string, limit: number) {
    return [...this.deliveries.values()]
      .filter((d) => d.status === "pending" && d.nextAttemptAt <= nowIso)
      .sort((a, b) => a.nextAttemptAt.localeCompare(b.nextAttemptAt))
      .slice(0, limit)
      .map((d) => ({ ...d }));
  }
  async listDeliveries(endpointId: string, limit: number) {
    return [...this.deliveries.values()]
      .filter((d) => d.endpointId === endpointId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((d) => ({ ...d }));
  }
  async updateDelivery(id: string, patch: Parameters<PlatformRepository["updateDelivery"]>[1]) {
    const d = this.deliveries.get(id);
    if (d) Object.assign(d, patch);
  }

  async getCursor(name: string) {
    return this.cursors.get(name) ?? 0;
  }
  async setCursor(name: string, value: number) {
    this.cursors.set(name, value);
  }

  async insertLog(l: RequestLog) {
    this.logs.push({ ...l });
    if (this.logs.length > 5000) this.logs.splice(0, this.logs.length - 5000);
  }
  async listLogs(namespace: string, limit: number) {
    return this.logs
      .filter((l) => l.namespace === namespace)
      .slice(-limit)
      .reverse()
      .map((l) => ({ ...l }));
  }
  async pruneLogs(beforeIso: string) {
    this.logs = this.logs.filter((l) => l.at >= beforeIso);
  }
}

/** The platform id used by the optional development key (TRUSTLOCK_DEV_API_KEY), which is a test key. */
export const DEV_PLATFORM_ID = "demoplatform";

const g = globalThis as unknown as { __trustlockPlatforms?: Promise<PlatformRepository> };

async function build(): Promise<PlatformRepository> {
  const sb = supabaseSettings();
  if (sb) {
    const db = createClient(sb.url, sb.key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: freshFetch } });
    return new SupabasePlatformRepository(db);
  }
  const repo = new MemoryPlatformRepository();
  const dev = process.env.TRUSTLOCK_DEV_API_KEY;
  // A ready-made key for trying the API in demo mode. Never honoured in production, where data would vanish on restart anyway.
  if (dev && dev.startsWith(KEY_PREFIX) && dev.length >= 24 && process.env.NODE_ENV !== "production") {
    await repo.insertKey({ id: randomUUID(), platformId: DEV_PLATFORM_ID, mode: "test", ownerId: null, label: "Development key", prefix: dev.slice(0, 13), keyHash: hashKey(dev), createdAt: new Date().toISOString(), revokedAt: null });
  }
  return repo;
}

export function getPlatformRepo(): Promise<PlatformRepository> {
  g.__trustlockPlatforms ??= build().catch((e) => {
    g.__trustlockPlatforms = undefined;
    throw e;
  });
  return g.__trustlockPlatforms;
}
