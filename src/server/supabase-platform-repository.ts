import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiKeyRecord, PlatformRepository, RequestLog, WebhookDelivery, WebhookEndpoint } from "./platform";

type Row = Record<string, unknown>;
const iso = (v: unknown) => new Date(v as string).toISOString();
const isoOrNull = (v: unknown) => (v ? iso(v) : null);

const toKey = (r: Row): ApiKeyRecord => ({
  id: r.id as string,
  platformId: r.platform_id as string,
  mode: (r.mode as "test" | "live") ?? "live",
  ownerId: (r.owner_id as string | null) ?? null,
  label: r.label as string,
  prefix: r.prefix as string,
  keyHash: r.key_hash as string,
  createdAt: iso(r.created_at),
  revokedAt: isoOrNull(r.revoked_at),
});

const toEndpoint = (r: Row): WebhookEndpoint => ({
  id: r.id as string,
  namespace: r.namespace as string,
  url: r.url as string,
  secret: r.secret as string,
  events: r.events as string[],
  enabled: r.enabled as boolean,
  createdAt: iso(r.created_at),
});

const toDelivery = (r: Row): WebhookDelivery => ({
  id: r.id as string,
  endpointId: r.endpoint_id as string,
  namespace: r.namespace as string,
  eventId: r.event_id as string,
  type: r.type as string,
  payload: r.payload as string,
  status: r.status as WebhookDelivery["status"],
  attempts: r.attempts as number,
  nextAttemptAt: iso(r.next_attempt_at),
  lastStatus: (r.last_status as number | null) ?? null,
  lastError: (r.last_error as string | null) ?? null,
  createdAt: iso(r.created_at),
  deliveredAt: isoOrNull(r.delivered_at),
});

const toLog = (r: Row): RequestLog => ({
  id: r.id as string,
  namespace: r.namespace as string,
  keyId: r.key_id as string,
  method: r.method as string,
  path: r.path as string,
  status: r.status as number,
  code: (r.code as string | null) ?? null,
  ms: r.ms as number,
  at: iso(r.at),
});

/** Postgres (Supabase) copy of the developer-platform store. Server-side only, with the service role key. See migrations 0003 and 0004. */
export class SupabasePlatformRepository implements PlatformRepository {
  constructor(private readonly db: SupabaseClient) {}

  private fail(label: string, error: { message?: string; code?: string } | null): never {
    throw new Error(`Database error while ${label}: ${error?.message ?? error?.code ?? "unknown"}`);
  }

  // ----- keys -----
  async insertKey(k: ApiKeyRecord): Promise<void> {
    const { error } = await this.db.from("api_keys").insert({ id: k.id, platform_id: k.platformId, mode: k.mode, owner_id: k.ownerId, label: k.label, prefix: k.prefix, key_hash: k.keyHash, created_at: k.createdAt });
    if (error) this.fail("saving an API key", error);
  }
  async findKeyByHash(keyHash: string): Promise<ApiKeyRecord | null> {
    const { data, error } = await this.db.from("api_keys").select("*").eq("key_hash", keyHash).maybeSingle();
    if (error) this.fail("reading an API key", error);
    return data ? toKey(data) : null;
  }
  async listKeys(platformId: string): Promise<ApiKeyRecord[]> {
    const { data, error } = await this.db.from("api_keys").select("*").eq("platform_id", platformId).order("created_at");
    if (error) this.fail("listing API keys", error);
    return (data ?? []).map(toKey);
  }
  async listKeysByOwner(ownerId: string): Promise<ApiKeyRecord[]> {
    const { data, error } = await this.db.from("api_keys").select("*").eq("owner_id", ownerId).order("created_at");
    if (error) this.fail("listing API keys", error);
    return (data ?? []).map(toKey);
  }
  async getKey(id: string): Promise<ApiKeyRecord | null> {
    const { data, error } = await this.db.from("api_keys").select("*").eq("id", id).maybeSingle();
    if (error) this.fail("reading an API key", error);
    return data ? toKey(data) : null;
  }
  async revokeKey(id: string, at: string): Promise<void> {
    const { error } = await this.db.from("api_keys").update({ revoked_at: at }).eq("id", id).is("revoked_at", null);
    if (error) this.fail("revoking an API key", error);
  }

  // ----- webhook endpoints -----
  async insertEndpoint(e: WebhookEndpoint): Promise<void> {
    const { error } = await this.db.from("webhook_endpoints").insert({ id: e.id, namespace: e.namespace, url: e.url, secret: e.secret, events: e.events, enabled: e.enabled, created_at: e.createdAt });
    if (error) this.fail("saving a webhook endpoint", error);
  }
  async listEndpoints(namespace: string): Promise<WebhookEndpoint[]> {
    const { data, error } = await this.db.from("webhook_endpoints").select("*").eq("namespace", namespace).order("created_at");
    if (error) this.fail("listing webhook endpoints", error);
    return (data ?? []).map(toEndpoint);
  }
  async getEndpoint(id: string): Promise<WebhookEndpoint | null> {
    const { data, error } = await this.db.from("webhook_endpoints").select("*").eq("id", id).maybeSingle();
    if (error) this.fail("reading a webhook endpoint", error);
    return data ? toEndpoint(data) : null;
  }
  async deleteEndpoint(id: string): Promise<void> {
    const { error } = await this.db.from("webhook_endpoints").delete().eq("id", id); // deliveries go with it (on delete cascade)
    if (error) this.fail("removing a webhook endpoint", error);
  }

  // ----- deliveries -----
  async insertDelivery(d: WebhookDelivery): Promise<boolean> {
    const { error } = await this.db.from("webhook_deliveries").insert({
      id: d.id, endpoint_id: d.endpointId, namespace: d.namespace, event_id: d.eventId, type: d.type, payload: d.payload, status: d.status,
      attempts: d.attempts, next_attempt_at: d.nextAttemptAt, last_status: d.lastStatus, last_error: d.lastError, created_at: d.createdAt, delivered_at: d.deliveredAt,
    });
    if (error?.code === "23505") return false; // unique (endpoint_id, event_id): this event was already queued for this endpoint
    if (error) this.fail("queueing a webhook delivery", error);
    return true;
  }
  async listDueDeliveries(nowIso: string, limit: number): Promise<WebhookDelivery[]> {
    const { data, error } = await this.db.from("webhook_deliveries").select("*").eq("status", "pending").lte("next_attempt_at", nowIso).order("next_attempt_at").limit(limit);
    if (error) this.fail("reading due webhook deliveries", error);
    return (data ?? []).map(toDelivery);
  }
  async listDeliveries(endpointId: string, limit: number): Promise<WebhookDelivery[]> {
    const { data, error } = await this.db.from("webhook_deliveries").select("*").eq("endpoint_id", endpointId).order("created_at", { ascending: false }).limit(limit);
    if (error) this.fail("listing webhook deliveries", error);
    return (data ?? []).map(toDelivery);
  }
  async updateDelivery(id: string, patch: Parameters<PlatformRepository["updateDelivery"]>[1]): Promise<void> {
    const row: Row = {};
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.attempts !== undefined) row.attempts = patch.attempts;
    if (patch.nextAttemptAt !== undefined) row.next_attempt_at = patch.nextAttemptAt;
    if (patch.lastStatus !== undefined) row.last_status = patch.lastStatus;
    if (patch.lastError !== undefined) row.last_error = patch.lastError;
    if (patch.deliveredAt !== undefined) row.delivered_at = patch.deliveredAt;
    const { error } = await this.db.from("webhook_deliveries").update(row).eq("id", id);
    if (error) this.fail("updating a webhook delivery", error);
  }

  // ----- scanner cursor -----
  async getCursor(name: string): Promise<number> {
    const { data, error } = await this.db.from("platform_cursors").select("value").eq("name", name).maybeSingle();
    if (error) this.fail("reading the webhook cursor", error);
    return data ? Number(data.value) : 0;
  }
  async setCursor(name: string, value: number): Promise<void> {
    const { error } = await this.db.from("platform_cursors").upsert({ name, value }, { onConflict: "name" });
    if (error) this.fail("saving the webhook cursor", error);
  }

  // ----- request log -----
  async insertLog(l: RequestLog): Promise<void> {
    const { error } = await this.db.from("api_request_logs").insert({ id: l.id, namespace: l.namespace, key_id: l.keyId, method: l.method, path: l.path, status: l.status, code: l.code, ms: l.ms, at: l.at });
    if (error) this.fail("logging an API request", error);
  }
  async listLogs(namespace: string, limit: number): Promise<RequestLog[]> {
    const { data, error } = await this.db.from("api_request_logs").select("*").eq("namespace", namespace).order("at", { ascending: false }).limit(limit);
    if (error) this.fail("reading the API log", error);
    return (data ?? []).map(toLog);
  }
  async pruneLogs(beforeIso: string): Promise<void> {
    const { error } = await this.db.from("api_request_logs").delete().lt("at", beforeIso);
    if (error) this.fail("pruning the API log", error);
  }
}
