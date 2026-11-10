import { execFileSync } from "node:child_process";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import * as usersRoute from "@/app/api/v1/users/route";
import * as userRoute from "@/app/api/v1/users/[externalId]/route";
import * as walletRoute from "@/app/api/v1/wallet/route";
import * as topUpsRoute from "@/app/api/v1/wallet/top-ups/route";
import * as withdrawRoute from "@/app/api/v1/wallet/withdrawals/route";
import * as contractsRoute from "@/app/api/v1/contracts/route";
import * as contractRoute from "@/app/api/v1/contracts/[id]/route";
import * as actionRoute from "@/app/api/v1/contracts/[id]/[action]/route";
import * as specRoute from "@/app/api/v1/openapi.json/route";
import { ACTIONS } from "./api-contracts";
import { generateApiKey, getPlatformRepo, hashKey, placeholderEmail } from "./platform";
import { openApiDocument } from "./openapi";

const DEV_KEY = "tlk_dev_key_for_the_api_tests_0123456789";
process.env.TRUSTLOCK_DEV_API_KEY = DEV_KEY;
process.env.TRUSTLOCK_SEED_DEMO = "false";

type Opts = { key?: string | null; user?: string; body?: unknown; idem?: string; ip?: string };
let n = 0;

async function call(handler: (r: NextRequest, c: { params: Promise<never> }) => Promise<Response>, method: string, path: string, o: Opts = {}, params: Record<string, string> = {}) {
  const headers: Record<string, string> = { "x-forwarded-for": o.ip ?? `10.0.0.${(n++ % 250) + 1}` };
  if (o.key !== null) headers.authorization = `Bearer ${o.key ?? DEV_KEY}`;
  if (o.user) headers["trustlock-user"] = o.user;
  if (o.idem) headers["idempotency-key"] = o.idem;
  const req = new NextRequest(`http://localhost/api/v1${path}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const res = await handler(req, { params: Promise.resolve(params) as never });
  // Responses are checked field by field below, so a loose type keeps the assertions readable.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

const register = (external_id: string, role: "client" | "freelancer", o: Opts = {}) =>
  call(usersRoute.POST, "POST", "/users", { ...o, body: { external_id, name: `Name ${external_id}`, role } });

const contractBody = (freelancer: string) => ({
  freelancer,
  title: "Logo and brand sheet",
  description: "Design a logo and a one-page brand sheet.",
  amount: 150_000,
  review_period_days: 3,
  revision_limit: 1,
  milestones: [
    { title: "Concepts", due_date: "2026-12-01", amount: 50_000 },
    { title: "Final files", due_date: "2026-12-15", amount: 100_000 },
  ],
});

const act = (action: string, id: string, user: string, body?: unknown, o: Opts = {}) => call(actionRoute.POST, "POST", `/contracts/${id}/${action}`, { ...o, user, body }, { id, action });

describe("developer API: sign-in with an API key", () => {
  it("refuses missing, malformed, unknown and revoked keys, and tells them apart from a good one", async () => {
    expect((await call(usersRoute.POST, "POST", "/users", { key: null })).body.error.code).toBe("MISSING_API_KEY");
    expect((await call(usersRoute.POST, "POST", "/users", { key: "nope" })).status).toBe(401);
    expect((await call(usersRoute.POST, "POST", "/users", { key: "tlk_" + "x".repeat(43) })).body.error.code).toBe("INVALID_API_KEY");

    const { secret, record } = generateApiKey("to revoke");
    await (await getPlatformRepo()).insertKey(record);
    expect((await register("rev-1", "client", { key: secret })).status).toBe(201);
    await (await getPlatformRepo()).revokeKey(record.id, new Date().toISOString());
    expect((await register("rev-2", "client", { key: secret })).status).toBe(401);
  });

  it("serves the OpenAPI description without a key, and documents every action the router accepts", async () => {
    const res = await specRoute.GET(new Request("http://localhost/api/v1/openapi.json"));
    const doc = (await res.json()) as { paths: Record<string, unknown> };
    for (const a of Object.keys(ACTIONS)) expect(doc.paths[`/contracts/{id}/${a}`], a).toBeTruthy();
    expect(openApiDocument("https://x.test").servers[0].url).toBe("https://x.test/api/v1");
  });

  it("keeps only a hash of the key and rate limits one key without touching another", async () => {
    const { secret, record } = generateApiKey("limited");
    expect(record.keyHash).toBe(hashKey(secret));
    expect(JSON.stringify(record)).not.toContain(secret);
    await (await getPlatformRepo()).insertKey(record);
    let last = 0;
    let retry: string | null = null;
    for (let i = 0; i < 125 && last !== 429; i++) {
      const req = new NextRequest("http://localhost/api/v1/wallet", { headers: { authorization: `Bearer ${secret}`, "x-forwarded-for": "10.9.9.9" } });
      const res = await walletRoute.GET(req, { params: Promise.resolve({}) });
      last = res.status;
      retry = res.headers.get("retry-after");
    }
    expect(last).toBe(429);
    expect(Number(retry)).toBeGreaterThan(0);
    expect((await register("still-fine", "client", { ip: "10.9.9.10" })).status).toBe(201);
  });
});

describe("developer API: a full escrow, driven only through the API", () => {
  const client = "cust-1001";
  const freelancer = "cust-2002";
  let id = "";

  beforeAll(async () => {
    expect((await register(client, "client")).status).toBe(201);
    expect((await register(freelancer, "freelancer")).status).toBe(201);
  });

  it("links users, updates them on repeat, and refuses a role change or someone else's email", async () => {
    const again = await call(usersRoute.POST, "POST", "/users", { body: { external_id: client, name: "Renamed", role: "client" } });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ external_id: client, name: "Renamed", role: "client" });
    expect((await call(usersRoute.POST, "POST", "/users", { body: { external_id: client, name: "x", role: "freelancer" } })).body.error.code).toBe("ROLE_IMMUTABLE");
    expect((await call(usersRoute.POST, "POST", "/users", { body: { external_id: "bad id!", name: "x", role: "client" } })).status).toBe(422);
    expect((await call(usersRoute.POST, "POST", "/users", { body: { external_id: "arb-1", name: "x", role: "arbitrator" } })).status).toBe(422);
    // Ids that look alike but differ are different people, and no email is ever returned or stored from the platform.
    const a = await call(usersRoute.POST, "POST", "/users", { body: { external_id: "a:b", name: "A", role: "client", email: "real@person.test" } });
    const b = await call(usersRoute.POST, "POST", "/users", { body: { external_id: "a@b", name: "B", role: "client" } });
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(JSON.stringify(a.body)).not.toContain("real@person.test");
  });

  it("needs the TrustLock-User header and a registered user", async () => {
    expect((await call(walletRoute.GET, "GET", "/wallet")).body.error.code).toBe("MISSING_USER");
    expect((await call(walletRoute.GET, "GET", "/wallet", { user: "ghost" })).body.error.code).toBe("USER_NOT_FOUND");
  });

  it("tops up with an idempotency key, once", async () => {
    expect((await call(topUpsRoute.POST, "POST", "/wallet/top-ups", { user: client, body: { amount: 500_000 } })).body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    const first = await call(topUpsRoute.POST, "POST", "/wallet/top-ups", { user: client, body: { amount: 500_000 }, idem: "topup-0001" });
    const retry = await call(topUpsRoute.POST, "POST", "/wallet/top-ups", { user: client, body: { amount: 500_000 }, idem: "topup-0001" });
    expect([first.status, first.body.available, retry.body.available]).toEqual([201, 500_000, 500_000]);
    expect((await call(topUpsRoute.POST, "POST", "/wallet/top-ups", { user: client, body: { amount: 1.5 }, idem: "topup-0002" })).status).toBe(422);
    expect((await call(topUpsRoute.POST, "POST", "/wallet/top-ups", { user: freelancer, body: { amount: 100 }, idem: "topup-0003" })).body.error.code).toBe("FORBIDDEN");
  });

  it("creates a contract once even if the request is retried", async () => {
    const first = await call(contractsRoute.POST, "POST", "/contracts", { user: client, body: contractBody(freelancer), idem: "create-0001" });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ state: "proposed", client, freelancer, amount: 150_000 });
    const retry = await call(contractsRoute.POST, "POST", "/contracts", { user: client, body: contractBody(freelancer), idem: "create-0001" });
    expect(retry.body.id).toBe(first.body.id);
    id = first.body.id;
    const list = await call(contractsRoute.GET, "GET", "/contracts", { user: client });
    expect(list.body.data).toHaveLength(1);
    expect((await call(contractsRoute.POST, "POST", "/contracts", { user: client, body: { ...contractBody(freelancer), amount: 1 }, idem: "create-0002" })).status).toBe(422);
    expect((await call(contractsRoute.POST, "POST", "/contracts", { user: client, body: contractBody("nobody"), idem: "create-0003" })).body.error.code).toBe("USER_NOT_FOUND");
  });

  it("walks accept, fund, start, deliver and approve, and pays the freelancer minus the fee", async () => {
    const view = await call(contractRoute.GET, "GET", `/contracts/${id}`, { user: freelancer }, { id });
    expect(view.body).toMatchObject({ your_role: "freelancer", awaiting: "freelancer" });
    expect(view.body.allowed_actions).toContain("accept");

    // The state machine, not the API, decides who may move: the client cannot accept their own proposal.
    expect((await act("accept", id, client)).status).toBe(409);
    expect((await act("accept", id, freelancer)).body.state).toBe("accepted");

    expect((await act("fund", id, client)).body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    const funded = await act("fund", id, client, undefined, { idem: "fund-0001" });
    expect(funded.body.state).toBe("funded");
    expect((await act("fund", id, client, undefined, { idem: "fund-0001" })).body.state).toBe("funded");
    expect((await call(walletRoute.GET, "GET", "/wallet", { user: client })).body).toMatchObject({ available: 350_000, held: 150_000 });

    expect((await act("start-work", id, freelancer)).body.state).toBe("in_progress");
    expect((await act("message", id, freelancer, { text: "Concepts coming tomorrow." })).body.messages.at(-1).text).toBe("Concepts coming tomorrow.");
    const delivered = await act("deliver", id, freelancer, { file_name: "brand.zip", size_bytes: 2048, sha256: "a".repeat(64) });
    expect(delivered.body).toMatchObject({ state: "delivered", deliverable: { name: "brand.zip", sha256: "a".repeat(64) } });

    expect((await act("approve", id, client, undefined, { idem: "approve-0001" })).body.state).toBe("completed");
    expect((await act("approve", id, client, undefined, { idem: "approve-0001" })).body.state).toBe("completed");

    const client2 = await call(walletRoute.GET, "GET", "/wallet", { user: client });
    const free = await call(walletRoute.GET, "GET", "/wallet", { user: freelancer });
    expect(client2.body).toMatchObject({ available: 350_000, held: 0 });
    expect(free.body.available).toBeGreaterThan(0);
    expect(free.body.available).toBeLessThanOrEqual(150_000);
    expect(free.body.entries.length).toBeGreaterThan(0);

    const payout = await call(withdrawRoute.POST, "POST", "/wallet/withdrawals", { user: freelancer, body: { amount: free.body.available }, idem: "payout-0001" });
    expect(payout.body.available).toBe(0);
    const user = await call(userRoute.GET, "GET", `/users/${client}`, {}, { externalId: client });
    expect(user.body.wallet).toEqual({ available: 350_000, held: 0 });
  });

  it("filters by state, rejects bad actions, and gives a stranger a 404 on someone else's contract", async () => {
    expect((await call(contractsRoute.GET, "GET", "/contracts?state=completed", { user: client })).body.data).toHaveLength(1);
    expect((await call(contractsRoute.GET, "GET", "/contracts?state=funded", { user: client })).body.data).toHaveLength(0);
    expect((await call(contractsRoute.GET, "GET", "/contracts?state=bogus", { user: client })).status).toBe(422);
    expect((await act("explode", id, client)).body.error.code).toBe("UNKNOWN_ACTION");
    expect((await act("__proto__", id, client)).body.error.code).toBe("UNKNOWN_ACTION");

    await register("cust-3003", "client");
    expect((await call(contractRoute.GET, "GET", `/contracts/${id}`, { user: "cust-3003" }, { id })).status).toBe(404);
    expect((await act("dispute", id, "cust-3003", { reason: "not mine" })).status).toBe(404);
    expect((await call(contractRoute.GET, "GET", "/contracts/not-a-uuid", { user: client }, { id: "not-a-uuid" })).status).toBe(404);
  });
});

describe("developer API: platforms cannot reach each other", () => {
  it("gives each platform its own namespace for users, contracts and wallets", async () => {
    const other = generateApiKey("Other app");
    await (await getPlatformRepo()).insertKey(other.record);
    const as = (o: Opts = {}) => ({ ...o, key: other.secret });

    // The same ids on the other platform are different people.
    expect((await register("pair-c", "client")).status).toBe(201);
    expect((await register("pair-f", "freelancer")).status).toBe(201);
    expect((await register("pair-c", "client", as())).status).toBe(201);
    expect((await register("pair-f", "freelancer", as())).status).toBe(201);
    await call(topUpsRoute.POST, "POST", "/wallet/top-ups", { user: "pair-c", body: { amount: 200_000 }, idem: "other-top-1" });
    expect((await call(walletRoute.GET, "GET", "/wallet", as({ user: "pair-c" }))).body.available).toBe(0);

    const made = await call(contractsRoute.POST, "POST", "/contracts", { user: "pair-c", body: contractBody("pair-f"), idem: "iso-create-1" });
    const id = made.body.id as string;
    expect((await call(contractRoute.GET, "GET", `/contracts/${id}`, as({ user: "pair-c" }), { id })).status).toBe(404);
    expect((await act("accept", id, "pair-f", undefined, as())).status).toBe(404);
    expect((await call(contractsRoute.GET, "GET", "/contracts", as({ user: "pair-c" }))).body.data).toEqual([]);
    expect((await call(userRoute.GET, "GET", "/users/cust-1001", as(), { externalId: "cust-1001" })).status).toBe(404);
  });

  it("hides a contract from a platform when the other side is a person from outside it", async () => {
    const repo = (await import("./container")).getContainer;
    const { repo: db, svc } = await repo();
    await register("mixed-f", "freelancer");
    await db.upsertUser({ id: "user_web_client", name: "Web Client", email: "web@example.com", role: "client" });
    await call(topUpsRoute.POST, "POST", "/wallet/top-ups", { user: "cust-1001", body: { amount: 100 }, idem: "mixed-top-1" });
    const made = await svc.createContract({ id: "user_web_client", role: "client" }, { ...{ title: "Web hire", description: "d", freelancerEmail: placeholderEmail("demoplatform-test", "mixed-f"), totalSC: "10", reviewPeriodDays: 3, revisionLimit: 1, milestones: [{ title: "m", dueDate: "2026-12-01", amountSC: "10" }] } });
    expect((await call(contractRoute.GET, "GET", `/contracts/${made.id}`, { user: "mixed-f" }, { id: made.id })).status).toBe(404);
    expect((await call(contractsRoute.GET, "GET", "/contracts", { user: "mixed-f" })).body.data).toEqual([]);
    expect((await act("accept", made.id, "mixed-f")).status).toBe(404);
  });
});

describe("developer API: key script", () => {
  it("makes keys in the same format the server checks, and stores only the hash", () => {
    const out = execFileSync("node", ["scripts/create-api-key.mjs", "--label", "Script test", "--dry-run"], { encoding: "utf8" });
    const key = /API key:\s+(tlk_\S+)/.exec(out)?.[1] ?? "";
    expect(key).toMatch(/^tlk_(live|test)_[A-Za-z0-9_-]{43}$/);
    expect(/Platform:\s+([a-z0-9]{12})/.test(out)).toBe(true);
    expect(hashKey(key)).toHaveLength(64);
  });
});
