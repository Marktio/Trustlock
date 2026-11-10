import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as usersRoute from "@/app/api/v1/users/route";
import * as walletRoute from "@/app/api/v1/wallet/route";
import * as topUpsRoute from "@/app/api/v1/wallet/top-ups/route";
import * as contractsRoute from "@/app/api/v1/contracts/route";
import * as contractRoute from "@/app/api/v1/contracts/[id]/route";
import * as actionRoute from "@/app/api/v1/contracts/[id]/[action]/route";
import * as endpointsRoute from "@/app/api/v1/webhook-endpoints/route";
import * as endpointRoute from "@/app/api/v1/webhook-endpoints/[id]/route";
import * as endpointTestRoute from "@/app/api/v1/webhook-endpoints/[id]/test/route";
import * as usageRoute from "@/app/api/v1/usage/route";
import { getContainer } from "./container";
import { generateApiKey, getPlatformRepo } from "./platform";
import { API_KEY_LIMIT } from "./api-v1";
import { checkLimit } from "./shared-limiter";
import { assertSafeWebhookUrl, attempt, isPrivateIp, processWebhooks, scanEvents, signPayload } from "./webhooks";

const TEST_KEY = "tlk_test_features_key_0123456789abcdef";
process.env.TRUSTLOCK_DEV_API_KEY = TEST_KEY; // a test-mode key for platform "demoplatform"
process.env.TRUSTLOCK_SEED_DEMO = "false";

type Handler = (r: NextRequest, c: { params: Promise<never> }) => Promise<Response>;
type Opts = { key?: string; user?: string; body?: unknown; idem?: string };
let n = 0;

async function call(handler: Handler, method: string, path: string, o: Opts = {}, params: Record<string, string> = {}) {
  const headers: Record<string, string> = { authorization: `Bearer ${o.key ?? TEST_KEY}`, "x-forwarded-for": `10.2.0.${(n++ % 250) + 1}` };
  if (o.user) headers["trustlock-user"] = o.user;
  if (o.idem) headers["idempotency-key"] = o.idem;
  const req = new NextRequest(`http://localhost/api/v1${path}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const res = await handler(req, { params: Promise.resolve(params) as never });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, headers: res.headers, body: (await res.json()) as Record<string, any> };
}

const register = (id: string, role: "client" | "freelancer", key?: string) => call(usersRoute.POST as Handler, "POST", "/users", { key, body: { external_id: id, name: id, role } });
const terms = (freelancer: string) => ({
  freelancer, title: "Webhook job", description: "Do it.", amount: 80_000, review_period_days: 3, revision_limit: 1,
  milestones: [{ title: "All", due_date: "2026-12-31", amount: 80_000 }],
});
const act = (action: string, id: string, user: string, body?: unknown, idem?: string, key?: string) =>
  call(actionRoute.POST as Handler, "POST", `/contracts/${id}/${action}`, { user, body, idem, key }, { id, action });

describe("shared rate limiter (Upstash)", () => {
  const redis = (counts: number[], ttl = 42_000) => {
    let i = 0;
    return vi.fn(async () => new Response(JSON.stringify([{ result: counts[Math.min(i++, counts.length - 1)] }, { result: 1 }, { result: ttl }]), { status: 200 }));
  };

  it("counts in Redis when configured: allows up to the limit, then refuses with the time left", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example/");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "secret-token");
    const f = redis([1, 120, 121]);
    expect((await checkLimit("k1", API_KEY_LIMIT, f as unknown as typeof fetch)).allowed).toBe(true);
    expect((await checkLimit("k1", API_KEY_LIMIT, f as unknown as typeof fetch)).allowed).toBe(true);
    const over = await checkLimit("k1", API_KEY_LIMIT, f as unknown as typeof fetch);
    expect(over).toMatchObject({ allowed: false, retryAfter: 42, remaining: 0 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://redis.example/pipeline");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
    expect(JSON.parse(init.body as string)[0]).toEqual(["INCR", "tl:rl:api-key:k1"]);
    vi.unstubAllEnvs();
  });

  it("falls back to counting locally when Redis is down, instead of dropping the limit", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "t");
    const down = vi.fn(async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    const tiny = { name: "tiny", max: 2, windowMs: 60_000 };
    const results = [];
    for (let i = 0; i < 3; i++) results.push((await checkLimit("down-key", tiny, down)).allowed);
    expect(results).toEqual([true, true, false]);
    const boom = vi.fn(async () => { throw new Error("timeout"); }) as unknown as typeof fetch;
    expect((await checkLimit("boom-key", tiny, boom)).allowed).toBe(true);
    vi.unstubAllEnvs();
  });
});

describe("test and live modes", () => {
  it("keeps a platform's test users, contracts and wallets apart from its live ones", async () => {
    const live = generateApiKey("live", { platformId: "demoplatform", mode: "live" });
    await (await getPlatformRepo()).insertKey(live.record);
    expect((await register("same-id", "client")).status).toBe(201); // test key
    const inLive = await register("same-id", "client", live.secret);
    expect(inLive.status).toBe(201); // a different user: the live namespace is empty
    expect(inLive.headers.get("trustlock-mode")).toBe("live");
    expect((await register("same-id", "client")).headers.get("trustlock-mode")).toBe("test");

    await call(topUpsRoute.POST as Handler, "POST", "/wallet/top-ups", { user: "same-id", body: { amount: 5_000 }, idem: "mode-top-0001" });
    expect((await call(walletRoute.GET as Handler, "GET", "/wallet", { user: "same-id" })).body.available).toBe(5_000);
    expect((await call(walletRoute.GET as Handler, "GET", "/wallet", { user: "same-id", key: live.secret })).body.available).toBe(0);
  });
});

describe("API usage log", () => {
  it("shows recent calls newest first, with error codes and ids folded into :id", async () => {
    const mine = generateApiKey("usage", { platformId: "usageplat001", mode: "test" });
    await (await getPlatformRepo()).insertKey(mine.record);
    await register("u-client", "client", mine.secret);
    await call(walletRoute.GET as Handler, "GET", "/wallet", { user: "nobody", key: mine.secret }); // 404 USER_NOT_FOUND
    const missing = "3f2a9c1e-0000-4000-8000-000000000001";
    await call(contractRoute.GET as Handler, "GET", `/contracts/${missing}`, { user: "u-client", key: mine.secret }, { id: missing });

    await vi.waitFor(async () => {
      const log = await call(usageRoute.GET as Handler, "GET", "/usage", { key: mine.secret });
      const rows = log.body.data as { method: string; path: string; status: number; error_code: string | null }[];
      expect(log.body.mode).toBe("test");
      const mineOnly = rows.filter((r) => r.path !== "/usage"); // the reads of the log are logged too
      expect(mineOnly.map((r) => [r.method, r.path, r.status, r.error_code])).toEqual([
        ["GET", "/contracts/:id", 404, "NOT_FOUND"],
        ["GET", "/wallet", 404, "USER_NOT_FOUND"],
        ["POST", "/users", 201, null],
      ]);
    });
    expect((await call(usageRoute.GET as Handler, "GET", "/usage?limit=0", { key: mine.secret })).status).toBe(422);
    // Another platform never sees these rows.
    const rows = (await call(usageRoute.GET as Handler, "GET", "/usage", {})).body.data as { path: string }[];
    expect(rows.every((r) => r.path !== "/contracts/:id")).toBe(true);
  });
});

describe("webhook destinations", () => {
  it("accepts public https addresses and refuses private ones", () => {
    vi.stubEnv("NODE_ENV", "production"); // plain http to localhost is only allowed while developing
    expect(assertSafeWebhookUrl("https://hooks.acme.example/trustlock").hostname).toBe("hooks.acme.example");
    for (const bad of ["http://hooks.acme.example/x", "https://localhost:3000/x", "https://10.0.0.5/x", "https://192.168.1.1/x", "https://169.254.169.254/latest/meta-data", "https://[::1]/x", "https://intranet/x", "https://db.internal/x", "https://user:pw@hooks.acme.example/x", "not a url", "ftp://x.example/y", "https://[fd00::1]/x"]) {
      expect(() => assertSafeWebhookUrl(bad), bad).toThrow(/url/i);
    }
    expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("172.31.0.1")).toBe(true);
    expect(isPrivateIp("172.32.0.1")).toBe(false);
    vi.unstubAllEnvs();
    expect(assertSafeWebhookUrl("http://localhost:4000/hook").hostname).toBe("localhost"); // development only
  });
});

describe("webhooks, end to end", () => {
  let server: Server;
  let hook: string;
  const received: { headers: Record<string, string | string[] | undefined>; body: string }[] = [];
  const reply = 200;

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push({ headers: req.headers, body });
        res.statusCode = reply;
        res.end("ok");
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    hook = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const events = () => received.filter((r) => r.headers["trustlock-event-type"] !== "ping").map((r) => JSON.parse(r.body) as { id: string; type: string; data: { state: string; contract: { id: string; state: string } } });

  it("sends every state change, signed, once each, in order, and only for events after the endpoint was made", async () => {
    await register("wh-buyer", "client");
    await register("wh-seller", "freelancer");
    await call(topUpsRoute.POST as Handler, "POST", "/wallet/top-ups", { user: "wh-buyer", body: { amount: 300_000 }, idem: "wh-top-0001" });
    const early = await call(contractsRoute.POST as Handler, "POST", "/contracts", { user: "wh-buyer", body: terms("wh-seller"), idem: "wh-create-early" });
    await new Promise((r) => setTimeout(r, 30)); // let the instant trigger scan past the early event

    expect((await call(endpointsRoute.POST as Handler, "POST", "/webhook-endpoints", { body: { url: "https://10.0.0.5/x" } })).status).toBe(422);
    const made = await call(endpointsRoute.POST as Handler, "POST", "/webhook-endpoints", { body: { url: hook } });
    expect(made.status).toBe(201);
    const secret = made.body.secret as string;
    expect(secret).toMatch(/^whsec_/);
    expect((await call(endpointsRoute.GET as Handler, "GET", "/webhook-endpoints")).body.data[0]).not.toHaveProperty("secret");

    // The contract made BEFORE the endpoint: nothing about it yet. Now drive a new one through the whole life.
    const c = await call(contractsRoute.POST as Handler, "POST", "/contracts", { user: "wh-buyer", body: terms("wh-seller"), idem: "wh-create-main" });
    const id = c.body.id as string;
    await act("accept", id, "wh-seller");
    await act("fund", id, "wh-buyer", undefined, "wh-fund-0001");
    await act("start-work", id, "wh-seller");
    await act("deliver", id, "wh-seller", { file_name: "a.zip", size_bytes: 9, sha256: "c".repeat(64) });
    await act("approve", id, "wh-buyer", undefined, "wh-approve-1");

    await vi.waitFor(() => expect(events().map((e) => e.type)).toEqual(["contract.proposed", "contract.accepted", "contract.funded", "contract.in_progress", "contract.delivered", "contract.approved", "contract.completed"]), { timeout: 5000 });
    expect(events().every((e) => e.data.contract.id === id)).toBe(true);
    expect(events().some((e) => e.data.contract.id === early.body.id)).toBe(false);

    // Each delivery carries a signature the receiver can check with the secret, and an id it can dedupe on.
    for (const r of received) {
      const sig = String(r.headers["trustlock-signature"]);
      const [, t, v1] = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(sig)!;
      expect(v1).toBe(createHmac("sha256", secret).update(`${t}.${r.body}`).digest("hex"));
    }
    expect(new Set(events().map((e) => e.id)).size).toBe(events().length);

    // Scanning again, even many times, never queues anything twice.
    const { repo } = await getContainer();
    const platforms = await getPlatformRepo();
    await processWebhooks({ repo, platforms });
    await processWebhooks({ repo, platforms });
    expect(events()).toHaveLength(7);

    const detail = await call(endpointRoute.GET as Handler, "GET", `/webhook-endpoints/${made.body.id}`, {}, { id: made.body.id });
    expect(detail.body.deliveries.every((d: { status: string }) => d.status === "delivered")).toBe(true);
  });

  it("can send a test ping, and another platform cannot see or remove the endpoint", async () => {
    const list = await call(endpointsRoute.GET as Handler, "GET", "/webhook-endpoints");
    const id = list.body.data[0].id as string;
    const ping = await call(endpointTestRoute.POST as Handler, "POST", `/webhook-endpoints/${id}/test`, {}, { id });
    expect(ping.body).toMatchObject({ type: "ping", status: "delivered", attempts: 1, last_status: 200 });

    const other = generateApiKey("other", { platformId: "otherplat002", mode: "live" });
    await (await getPlatformRepo()).insertKey(other.record);
    expect((await call(endpointRoute.GET as Handler, "GET", `/webhook-endpoints/${id}`, { key: other.secret }, { id })).status).toBe(404);
    expect((await call(endpointRoute.DELETE as Handler, "DELETE", `/webhook-endpoints/${id}`, { key: other.secret }, { id })).status).toBe(404);
    expect((await call(endpointTestRoute.POST as Handler, "POST", `/webhook-endpoints/${id}/test`, { key: other.secret }, { id })).status).toBe(404);
    expect((await call(endpointsRoute.GET as Handler, "GET", "/webhook-endpoints", { key: other.secret })).body.data).toEqual([]);
  });

  it("retries a failing endpoint with growing waits, then gives up, and a removed endpoint stops its deliveries", async () => {
    const { repo } = await getContainer();
    const platforms = await getPlatformRepo();
    const deps = { repo, platforms, fetcher: vi.fn(async () => new Response("no", { status: 500 })) as unknown as typeof fetch };
    const ep = (await platforms.listEndpoints("demoplatform-test"))[0];
    const d = { id: crypto.randomUUID(), endpointId: ep.id, namespace: ep.namespace, eventId: "evt_retry", type: "contract.funded", payload: "{}", status: "pending" as const, attempts: 0, nextAttemptAt: new Date().toISOString(), lastStatus: null, lastError: null, createdAt: new Date().toISOString(), deliveredAt: null };
    await platforms.insertDelivery(d);
    const t0 = new Date("2026-12-01T00:00:00Z");

    let cur = await attempt(deps, d, t0);
    expect([cur.status, cur.attempts, cur.lastStatus, cur.nextAttemptAt]).toEqual(["pending", 1, 500, "2026-12-01T00:01:00.000Z"]);
    cur = await attempt(deps, cur, t0);
    expect(cur.nextAttemptAt).toBe("2026-12-01T00:05:00.000Z");
    for (let i = 0; i < 3; i++) cur = await attempt(deps, cur, t0);
    expect(cur.status).toBe("pending");
    cur = await attempt(deps, cur, t0);
    expect([cur.status, cur.attempts]).toEqual(["failed", 6]);

    await platforms.deleteEndpoint(ep.id);
    expect((await platforms.listDeliveries(ep.id, 10))).toEqual([]);
  });

  it("hands events to QStash when it is configured, with the signature forwarded and a dedupe id", async () => {
    vi.stubEnv("QSTASH_TOKEN", "qtoken");
    const { repo } = await getContainer();
    const platforms = await getPlatformRepo();
    const ep = { id: crypto.randomUUID(), namespace: "qplat0000001", url: "https://hooks.acme.example/in", secret: "whsec_x", events: ["*"], enabled: true, createdAt: new Date().toISOString() };
    await platforms.insertEndpoint(ep);
    const f = vi.fn(async () => new Response("{}", { status: 202 }));
    const d = { id: crypto.randomUUID(), endpointId: ep.id, namespace: ep.namespace, eventId: "evt_q1", type: "contract.funded", payload: '{"a":1}', status: "pending" as const, attempts: 0, nextAttemptAt: new Date().toISOString(), lastStatus: null, lastError: null, createdAt: new Date().toISOString(), deliveredAt: null };
    await platforms.insertDelivery(d);
    const out = await attempt({ repo, platforms, fetcher: f as unknown as typeof fetch }, d);
    expect(out.status).toBe("delivered");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    const h = init.headers as Record<string, string>;
    expect(url).toBe("https://qstash.upstash.io/v2/publish/https://hooks.acme.example/in");
    expect(h.Authorization).toBe("Bearer qtoken");
    expect(h["Upstash-Deduplication-Id"]).toBe(`${ep.id}-evt_q1`);
    expect(h["Upstash-Forward-TrustLock-Signature"]).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(signPayload("whsec_x", '{"a":1}', 1)).toBe(`t=1,v1=${createHmac("sha256", "whsec_x").update('1.{"a":1}').digest("hex")}`);
    vi.unstubAllEnvs();
    expect(scanEvents).toBeTypeOf("function");
  });
});

describe("dispute evidence through the API", () => {
  it("lets either side add text and file fingerprints while a dispute is open, and only then", async () => {
    await register("ev-buyer", "client");
    await register("ev-seller", "freelancer");
    await call(topUpsRoute.POST as Handler, "POST", "/wallet/top-ups", { user: "ev-buyer", body: { amount: 200_000 }, idem: "ev-top-0001" });
    const id = (await call(contractsRoute.POST as Handler, "POST", "/contracts", { user: "ev-buyer", body: terms("ev-seller"), idem: "ev-create-1" })).body.id as string;
    await act("accept", id, "ev-seller");
    await act("fund", id, "ev-buyer", undefined, "ev-fund-0001");
    await act("start-work", id, "ev-seller");
    await act("deliver", id, "ev-seller", { file_name: "work.zip", size_bytes: 5, sha256: "d".repeat(64) });

    expect((await act("evidence", id, "ev-buyer", { text: "Too early" })).status).toBe(409); // no dispute yet
    const raised = await act("dispute", id, "ev-buyer", { reason: "The files do not match what was agreed in the brief." });
    expect(raised.body.state).toBe("disputed");
    expect(raised.body.allowed_actions).toContain("evidence");
    expect(raised.body.evidence).toEqual({ can_submit: true, files_left: 5 });

    const sent = await act("evidence", id, "ev-buyer", { text: "The brief asked for three concepts, only one came.", files: [{ file_name: "brief.pdf", size_bytes: 1200, sha256: "e".repeat(64) }] });
    expect(sent.status).toBe(200);
    expect(sent.body.evidence.files_left).toBe(4);
    expect((await act("evidence", id, "ev-seller", { text: "Concepts two and three were sent by email." })).status).toBe(200);
    expect((await act("evidence", id, "ev-buyer", {})).status).toBe(422); // nothing to add
    expect((await act("evidence", id, "ev-buyer", { files: Array.from({ length: 5 }, (_, i) => ({ file_name: `f${i}.pdf`, size_bytes: 1, sha256: "f".repeat(64) })) })).body.error.code).toBe("LIMIT");

    await register("ev-stranger", "client");
    expect((await act("evidence", id, "ev-stranger", { text: "hi" })).status).toBe(404);
    const view = await call(contractRoute.GET as Handler, "GET", `/contracts/${id}`, { user: "ev-seller" }, { id });
    expect(view.body.timeline.filter((e: { event: string }) => e.event === "evidence.submitted")).toHaveLength(2);
  });
});
