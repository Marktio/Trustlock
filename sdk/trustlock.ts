/**
 * TrustLock client for server-side JavaScript/TypeScript (Node 18+, Bun, Deno, Cloudflare Workers).
 * One file, no dependencies. Copy it into your project, or import it from here.
 *
 *   const tl = new TrustLock({ apiKey: process.env.TRUSTLOCK_API_KEY!, baseUrl: "https://your-trustlock-host" });
 *   await tl.users.upsert({ id: "cust-1001", name: "Amina", role: "client" });
 *   const contract = await tl.as("cust-1001").contracts.create({ ... }, { idempotencyKey: `order-${order.id}` });
 *
 * Keep the API key on your server. Never ship it to a browser or a mobile app.
 */

export type Role = "client" | "freelancer";
export type ContractState =
  | "draft" | "proposed" | "accepted" | "funded" | "in_progress" | "delivered" | "approved" | "completed"
  | "disputed" | "refunded" | "resolved_split" | "rejected" | "cancelled" | "expired";

export interface User { external_id: string; name: string; role: Role }
export interface Balances { available: number; held: number }
export interface Milestone { title: string; due_date: string; amount: number }

export interface Contract {
  id: string; ref: string; title: string; description: string; state: ContractState; version: number;
  client: string; freelancer: string; amount: number; fee_bps: number; milestones: Milestone[];
  review_period_days: number; revision_limit: number; revisions_used: number;
  expires_at: string | null; delivered_at: string | null; review_ends_at: string | null;
  deliverable: { name: string; size_bytes: number; sha256: string; note: string | null } | null;
  revision_reason: string | null; created_at: string; updated_at: string;
}

export interface ContractDetail extends Contract {
  your_role: Role;
  /** What this user can do right now, e.g. ["fund", "cancel"]. Drive your buttons from this. */
  allowed_actions: string[];
  awaiting: Role;
  timeline: { at: string; event: string; by: string | null; by_role: string; note: string | null }[];
  messages: { at: string; by: string | null; text: string }[];
}

export type KeyMode = "test" | "live";
export interface WebhookEndpoint { id: string; url: string; events: string[]; enabled: boolean; created_at: string }
export interface WebhookDelivery {
  event_id: string; type: string; status: "pending" | "delivered" | "failed"; attempts: number; last_status: number | null;
  last_error: string | null; next_attempt_at: string | null; created_at: string; delivered_at: string | null;
}
export interface UsageEntry { at: string; method: string; path: string; status: number; error_code: string | null; ms: number }
export interface WebhookEvent<T = unknown> { id: string; type: string; created_at: string; data: T }

export interface NewContract {
  /** Your id for the freelancer. */
  freelancer: string;
  title: string;
  description: string;
  /** Minor units (100 = 1 credit). Must equal the sum of the milestones. */
  amount: number;
  review_period_days: number;
  revision_limit: number;
  milestones: Milestone[];
}

export interface CallOptions {
  /**
   * Makes a retry safe: the same key always gives the same result and changes nothing twice. Derive it from YOUR record
   * (for example `fund-${order.id}`) so it survives your own crashes and retries. If you leave it out, the client makes
   * one per call, which only protects the client's own automatic retries.
   */
  idempotencyKey?: string;
}

export class TrustLockError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "TrustLockError";
    this.status = status;
    this.code = code;
  }
}

export interface TrustLockConfig {
  apiKey: string;
  /** Where TrustLock runs, without /api/v1. */
  baseUrl: string;
  /** Automatic retries for network errors, 429 and 5xx. Only requests that are safe to repeat are retried. Default 2. */
  maxRetries?: number;
  /** Per-request timeout in milliseconds. Default 15000. */
  timeoutMs?: number;
  /** Bring your own fetch (tests, proxies). */
  fetch?: typeof fetch;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const newKey = () => `sdk-${globalThis.crypto.randomUUID()}`;

export class TrustLock {
  private readonly cfg: Required<Omit<TrustLockConfig, "fetch">> & { fetch: typeof fetch };

  constructor(config: TrustLockConfig) {
    if (!config.apiKey?.startsWith("tlk_")) throw new Error("TrustLock: apiKey should start with tlk_");
    this.cfg = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl.replace(/\/+$/, ""),
      maxRetries: config.maxRetries ?? 2,
      timeoutMs: config.timeoutMs ?? 15_000,
      fetch: config.fetch ?? ((...a) => fetch(...a)),
    };
  }

  /** Your users. These calls are not made on behalf of anyone. */
  readonly users = {
    /** Link one of your users. Safe to repeat. The role cannot change later. */
    upsert: (u: { id: string; name: string; role: Role }) =>
      this.request<User>("POST", "/users", { body: { external_id: u.id, name: u.name, role: u.role } }),
    get: (id: string) => this.request<User & { wallet: Balances }>("GET", `/users/${encodeURIComponent(id)}`),
  };

  /** Where TrustLock sends events. Your key's mode (test or live) decides which events an endpoint hears. */
  readonly webhooks = {
    /** The response holds the signing `secret` once. Store it. */
    create: (url: string, events: string[] = ["*"]) => this.request<WebhookEndpoint & { secret: string }>("POST", "/webhook-endpoints", { body: { url, events } }),
    list: async () => (await this.request<{ data: WebhookEndpoint[] }>("GET", "/webhook-endpoints")).data,
    /** The endpoint and its recent deliveries, with attempts and failure reasons. */
    get: (id: string) => this.request<WebhookEndpoint & { deliveries: WebhookDelivery[] }>("GET", `/webhook-endpoints/${id}`),
    delete: (id: string) => this.request<{ deleted: boolean }>("DELETE", `/webhook-endpoints/${id}`),
    /** Sends a ping now and reports how your server answered. */
    test: (id: string) => this.request<WebhookDelivery>("POST", `/webhook-endpoints/${id}/test`),
  };

  /** The most recent calls made with your keys in this mode: what you called and why one failed. */
  async usage(limit = 50) {
    return (await this.request<{ mode: KeyMode; data: UsageEntry[] }>("GET", `/usage?limit=${limit}`)).data;
  }

  /** Everything below runs as this user, with exactly the powers they have in TrustLock. */
  as(userId: string) {
    const call = <T>(method: string, path: string, o: { body?: unknown; idem?: string | true } = {}) =>
      this.request<T>(method, path, { ...o, user: userId });
    const act = (id: string, action: string, body?: unknown, o: CallOptions = {}) =>
      call<ContractDetail>("POST", `/contracts/${id}/${action}`, { body, idem: o.idempotencyKey });
    const keyed = (id: string, action: string, o: CallOptions) => call<ContractDetail>("POST", `/contracts/${id}/${action}`, { idem: o.idempotencyKey ?? true });

    return {
      wallet: {
        get: () => call<Balances & { entries: { tx_id: string; balance: "available" | "held"; amount: number; memo: string; contract_id: string | null; created_at: string }[] }>("GET", "/wallet"),
        topUp: (amount: number, o: CallOptions = {}) => call<Balances>("POST", "/wallet/top-ups", { body: { amount }, idem: o.idempotencyKey ?? true }),
        withdraw: (amount: number, o: CallOptions = {}) => call<Balances>("POST", "/wallet/withdrawals", { body: { amount }, idem: o.idempotencyKey ?? true }),
      },
      contracts: {
        list: async (filter: { state?: ContractState } = {}) =>
          (await call<{ data: Contract[] }>("GET", `/contracts${filter.state ? `?state=${filter.state}` : ""}`)).data,
        get: (id: string) => call<ContractDetail>("GET", `/contracts/${id}`),
        /** The client proposes a contract to one of your freelancers. */
        create: (c: NewContract, o: CallOptions = {}) => call<Contract>("POST", "/contracts", { body: c, idem: o.idempotencyKey ?? true }),
        accept: (id: string) => act(id, "accept"),
        reject: (id: string, reason: string) => act(id, "reject", { reason }),
        counter: (id: string, terms: Omit<NewContract, "freelancer" | "title" | "description"> & { note: string }) => act(id, "counter", terms),
        acceptCounter: (id: string) => act(id, "accept-counter"),
        declineCounter: (id: string, reason: string) => act(id, "decline-counter", { reason }),
        cancel: (id: string, reason?: string) => act(id, "cancel", reason ? { reason } : undefined),
        /** Moves the client's credits into escrow. */
        fund: (id: string, o: CallOptions = {}) => keyed(id, "fund", o),
        startWork: (id: string) => act(id, "start-work"),
        /** Records the file by name, size and SHA-256. The file itself stays with you. */
        deliver: (id: string, file: { file_name: string; size_bytes: number; sha256: string; note?: string }) => act(id, "deliver", file),
        requestRevision: (id: string, reason: string) => act(id, "request-revision", { reason }),
        /** Releases the escrow to the freelancer (minus the platform fee). */
        approve: (id: string, o: CallOptions = {}) => keyed(id, "approve", o),
        dispute: (id: string, reason: string) => act(id, "dispute", { reason }),
        withdrawDispute: (id: string) => act(id, "withdraw-dispute"),
        cancelFunded: (id: string) => act(id, "cancel-funded"),
        declineCancel: (id: string) => act(id, "decline-cancel"),
        message: (id: string, text: string) => act(id, "message", { text }),
        /** Dispute evidence: a note and/or files by name, size and SHA-256 (the files themselves stay with you). */
        submitEvidence: (id: string, e: { text?: string; files?: { file_name: string; size_bytes: number; sha256: string }[] }) => act(id, "evidence", e),
      },
    };
  }

  private async request<T>(method: string, path: string, o: { user?: string; body?: unknown; idem?: string | true } = {}): Promise<T> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.cfg.apiKey}`, Accept: "application/json" };
    if (o.user) headers["TrustLock-User"] = o.user;
    if (o.body !== undefined) headers["Content-Type"] = "application/json";
    const key = o.idem === true ? newKey() : o.idem;
    if (key) headers["Idempotency-Key"] = key;
    // A request may be repeated after a failure only if repeating it cannot do anything twice.
    const repeatable = method === "GET" || Boolean(key);

    for (let attempt = 0; ; attempt++) {
      const last = attempt >= this.cfg.maxRetries;
      let res: Response;
      try {
        res = await this.cfg.fetch(`${this.cfg.baseUrl}/api/v1${path}`, {
          method,
          headers,
          body: o.body === undefined ? undefined : JSON.stringify(o.body),
          signal: AbortSignal.timeout(this.cfg.timeoutMs),
        });
      } catch (e) {
        if (!repeatable || last) throw e;
        await sleep(200 * 2 ** attempt);
        continue;
      }
      const data = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
      if (res.ok) return data as T;
      // 429 means the request was refused before it did anything, so it is always safe to repeat.
      const retry = !last && (res.status === 429 || (res.status >= 500 && repeatable));
      if (retry) {
        const wait = Number(res.headers.get("retry-after"));
        await sleep(res.status === 429 && wait > 0 ? Math.min(wait, 30) * 1000 : 200 * 2 ** attempt);
        continue;
      }
      throw new TrustLockError(res.status, data?.error?.code ?? "UNKNOWN", data?.error?.message ?? `TrustLock answered ${res.status}`);
    }
  }
}

/**
 * Check a webhook before you trust it. Pass the RAW request body (the exact text, not re-serialised JSON), the
 * TrustLock-Signature header and your endpoint secret. Returns the event, or throws. Uses Node's crypto (Node, Bun, Deno).
 * Deduplicate on event.id: a delivery can arrive more than once, and a retry keeps its original timestamp, so the
 * default tolerance is a day.
 */
export async function verifyWebhook(rawBody: string, signatureHeader: string | null, secret: string, toleranceSeconds = 86_400): Promise<WebhookEvent> {
  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const parts = Object.fromEntries((signatureHeader ?? "").split(",").map((p) => p.trim().split("=") as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !parts.v1) throw new Error("TrustLock webhook: malformed signature header");
  if (Math.abs(Date.now() / 1000 - t) > toleranceSeconds) throw new Error("TrustLock webhook: timestamp outside tolerance");
  const want = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  const got = Buffer.from(parts.v1, "hex");
  if (got.length !== want.length || !timingSafeEqual(got, want)) throw new Error("TrustLock webhook: signature does not match");
  return JSON.parse(rawBody) as WebhookEvent;
}
