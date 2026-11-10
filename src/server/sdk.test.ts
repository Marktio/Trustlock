import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import * as usersRoute from "@/app/api/v1/users/route";
import * as userRoute from "@/app/api/v1/users/[externalId]/route";
import * as walletRoute from "@/app/api/v1/wallet/route";
import * as topUpsRoute from "@/app/api/v1/wallet/top-ups/route";
import * as withdrawRoute from "@/app/api/v1/wallet/withdrawals/route";
import * as contractsRoute from "@/app/api/v1/contracts/route";
import * as contractRoute from "@/app/api/v1/contracts/[id]/route";
import * as actionRoute from "@/app/api/v1/contracts/[id]/[action]/route";
import { ACTIONS } from "./api-contracts";
import { TrustLock, TrustLockError, verifyWebhook } from "../../sdk/trustlock";
import { signPayload } from "./webhooks";

const KEY = "tlk_sdk_test_key_0123456789abcdef0123";
process.env.TRUSTLOCK_DEV_API_KEY = KEY;
process.env.TRUSTLOCK_SEED_DEMO = "false";

type Handler = (r: NextRequest, c: { params: Promise<never> }) => Promise<Response>;

/** A fetch that talks straight to the route handlers, so the SDK is tested against the real API without a network. */
function handlerFetch(log: { method: string; path: string; idem: string | null }[] = []): typeof fetch {
  let n = 0;
  return async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/api/v1", "");
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    headers.set("x-forwarded-for", `10.1.0.${(n++ % 250) + 1}`);
    log.push({ method, path, idem: headers.get("idempotency-key") });
    const req = new NextRequest(url, { method, headers, body: (init?.body as string | undefined) ?? undefined });
    const seg = path.split("/").filter(Boolean);
    let h: Handler;
    let params: Record<string, string> = {};
    if (seg[0] === "users") [h, params] = seg[1] ? [userRoute[method as "GET"] as Handler, { externalId: seg[1] }] : [usersRoute.POST as Handler, {}];
    else if (seg[0] === "wallet") h = (seg[1] === "top-ups" ? topUpsRoute.POST : seg[1] === "withdrawals" ? withdrawRoute.POST : walletRoute.GET) as Handler;
    else if (seg[2]) [h, params] = [actionRoute.POST as Handler, { id: seg[1], action: seg[2] }];
    else if (seg[1]) [h, params] = [contractRoute.GET as Handler, { id: seg[1] }];
    else h = (method === "POST" ? contractsRoute.POST : contractsRoute.GET) as Handler;
    return h(req, { params: Promise.resolve(params) as never });
  };
}

const terms = (freelancer: string) => ({
  freelancer, title: "SDK job", description: "Do it.", amount: 90_000, review_period_days: 3, revision_limit: 1,
  milestones: [{ title: "All", due_date: "2026-12-31", amount: 90_000 }],
});

describe("TypeScript client (sdk/trustlock.ts)", () => {
  const log: { method: string; path: string; idem: string | null }[] = [];
  const tl = new TrustLock({ apiKey: KEY, baseUrl: "http://trustlock.test", fetch: handlerFetch(log) });

  it("runs a whole escrow and drives the buttons from allowed_actions, using the names the API accepts", async () => {
    await tl.users.upsert({ id: "buyer-1", name: "Buyer", role: "client" });
    await tl.users.upsert({ id: "seller-1", name: "Seller", role: "freelancer" });
    await tl.as("buyer-1").wallet.topUp(300_000);
    const c = await tl.as("buyer-1").contracts.create(terms("seller-1"), { idempotencyKey: "create-sdk-1" });
    expect((await tl.as("buyer-1").contracts.create(terms("seller-1"), { idempotencyKey: "create-sdk-1" })).id).toBe(c.id);

    // Whatever the API says is allowed must be a real endpoint, for every state the contract passes through.
    const advertised = async (user: string) => (await tl.as(user).contracts.get(c.id)).allowed_actions;
    const seen = new Set<string>();
    const note = async (user: string) => (await advertised(user)).forEach((a) => seen.add(a));

    await note("seller-1");
    expect((await tl.as("seller-1").contracts.accept(c.id)).state).toBe("accepted");
    await note("buyer-1");
    expect((await tl.as("buyer-1").contracts.fund(c.id)).state).toBe("funded");
    await note("seller-1");
    expect((await tl.as("seller-1").contracts.startWork(c.id)).state).toBe("in_progress");
    const delivered = await tl.as("seller-1").contracts.deliver(c.id, { file_name: "a.zip", size_bytes: 10, sha256: "b".repeat(64) });
    expect(delivered.state).toBe("delivered");
    await note("buyer-1");
    expect((await advertised("buyer-1")).sort()).toEqual(["approve", "dispute", "request-revision"]);
    expect((await tl.as("buyer-1").contracts.approve(c.id)).state).toBe("completed");

    for (const a of seen) expect(Object.keys(ACTIONS), `advertised "${a}" must be callable`).toContain(a);
    expect(await tl.as("seller-1").contracts.list({ state: "completed" })).toHaveLength(1);
    expect((await tl.as("seller-1").wallet.get()).available).toBeGreaterThan(0);
    expect((await tl.users.get("buyer-1")).wallet).toEqual({ available: 210_000, held: 0 });
  });

  it("sends an idempotency key on money moves even when you do not pass one", () => {
    const money = log.filter((r) => /top-ups|\/fund$|\/approve$/.test(r.path));
    expect(money.length).toBeGreaterThan(0);
    for (const r of money) expect(r.idem, `${r.method} ${r.path}`).toMatch(/^(sdk-|create-|fund-|approve-)?.{8,}/);
  });

  it("raises TrustLockError with the status and code", async () => {
    await expect(tl.as("nobody").wallet.get()).rejects.toMatchObject({ name: "TrustLockError", status: 404, code: "USER_NOT_FOUND" });
    await expect(tl.as("seller-1").wallet.topUp(100)).rejects.toBeInstanceOf(TrustLockError);
    await expect(new TrustLock({ apiKey: "tlk_wrong_wrong_wrong_wrong_wrong_1", baseUrl: "http://trustlock.test", fetch: handlerFetch() }).users.get("x")).rejects.toMatchObject({ status: 401 });
    expect(() => new TrustLock({ apiKey: "nope", baseUrl: "x" })).toThrow(/tlk_/);
  });

  it("retries only what is safe to repeat, and reuses the same idempotency key when it does", async () => {
    const seenKeys: (string | null)[] = [];
    let failures = 2;
    const flaky: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      seenKeys.push(headers.get("idempotency-key"));
      if (failures-- > 0) return new Response(JSON.stringify({ error: { code: "INTERNAL", message: "boom" } }), { status: 503, headers: { "content-type": "application/json" } });
      return handlerFetch()(input, init);
    };
    const quick = new TrustLock({ apiKey: KEY, baseUrl: "http://trustlock.test", fetch: flaky, maxRetries: 3 });
    expect((await quick.as("buyer-1").wallet.topUp(1_000, { idempotencyKey: "flaky-topup-1" })).available).toBe(211_000);
    expect(seenKeys).toEqual(["flaky-topup-1", "flaky-topup-1", "flaky-topup-1"]);

    // An action with no key (accept) must NOT be retried after a 503: it could have run.
    let calls = 0;
    const down: typeof fetch = async () => (calls++, new Response(JSON.stringify({ error: { code: "INTERNAL", message: "boom" } }), { status: 503 }));
    await expect(new TrustLock({ apiKey: KEY, baseUrl: "http://trustlock.test", fetch: down }).as("seller-1").contracts.accept("00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({ status: 503 });
    expect(calls).toBe(1);
  });

  it("verifies webhook signatures made by the server", async () => {
    const body = JSON.stringify({ id: "evt_1", type: "contract.funded", created_at: "2026-01-01T00:00:00Z", data: {} });
    const sig = signPayload("whsec_test", body);
    expect((await verifyWebhook(body, sig, "whsec_test")).id).toBe("evt_1");
    await expect(verifyWebhook(body + " ", sig, "whsec_test")).rejects.toThrow(/does not match/);
    await expect(verifyWebhook(body, sig, "other")).rejects.toThrow(/does not match/);
    await expect(verifyWebhook(body, signPayload("whsec_test", body, 1_000), "whsec_test")).rejects.toThrow(/tolerance/);
    await expect(verifyWebhook(body, null, "whsec_test")).rejects.toThrow(/malformed/);
  });
});
