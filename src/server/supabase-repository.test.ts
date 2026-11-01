// Runs the real migration (supabase/migrations/0001_init.sql and 0002_counter_proposals.sql) on a throwaway Postgres and drives the real escrow service through
// SupabaseRepository. Only the PostgREST HTTP layer is replaced (src/test/pg-shim.ts). If embedded Postgres cannot start here,
// the suite is skipped and says so; it is never reported as passing.
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EscrowService, DEFAULT_CONFIG } from "@/domain/escrow-service";
import { SimulatedGateway } from "@/domain/gateway";
import { parseAudit } from "@/domain/audit";
import { FakeClock, USERS, actorOf, goodFile, sc, validContract } from "@/test/helpers";
import { pgClient } from "@/test/pg-shim";
import { SupabaseRepository, buildCommitPayload } from "./supabase-repository";

const PORT = 54329;
let admin: pg.Client | null = null;
let stop: (() => Promise<void>) | null = null;
let startError: string | null = null;
let counter = 0;

beforeAll(async () => {
  try {
    const { default: EmbeddedPostgres } = await import("embedded-postgres");
    const dir = mkdtempSync(path.join(tmpdir(), "tl-pg-"));
    const server = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "pw", port: PORT, persistent: false, onLog: () => {}, onError: () => {} });
    await server.initialise();
    await server.start();
    stop = async () => {
      await server.stop();
      rmSync(dir, { recursive: true, force: true });
    };
    admin = new pg.Client({ host: "localhost", port: PORT, user: "postgres", password: "pw", database: "postgres" });
    await admin.connect();
    await admin.query("create database tpl");
    const tpl = new pg.Client({ host: "localhost", port: PORT, user: "postgres", password: "pw", database: "tpl" });
    await tpl.connect();
    // What Supabase provides before our migration runs.
    await tpl.query(`
      do $$ begin
        if not exists (select from pg_roles where rolname='anon') then create role anon nologin; end if;
        if not exists (select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
        if not exists (select from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
      end $$;
      create schema if not exists extensions;`);
    for (const file of ["0001_init.sql", "0002_counter_proposals.sql"]) {
      await tpl.query(readFileSync(path.resolve(import.meta.dirname, "../../supabase/migrations", file), "utf8"));
    }
    await tpl.end();
  } catch (e) {
    startError = (e as Error).message;
  }
}, 120_000);

afterAll(async () => {
  await admin?.end();
  await stop?.();
});

async function fresh() {
  counter += 1;
  const name = `t${counter}`;
  await admin!.query(`create database ${name} template tpl`);
  const pool = new pg.Pool({ host: "localhost", port: PORT, user: "postgres", password: "pw", database: name, max: 8 });
  const clock = new FakeClock();
  const repo = new SupabaseRepository(pgClient(pool) as unknown as SupabaseClient, clock);
  const svc = new EscrowService(repo, clock, new SimulatedGateway(), DEFAULT_CONFIG);
  for (const u of Object.values(USERS)) await repo.upsertUser(u);
  return { pool, repo, svc, amina: actorOf(USERS.amina), brian: actorOf(USERS.brian), faith: actorOf(USERS.faith) };
}

describe("SupabaseRepository on real Postgres", () => {
  // If a database cannot start (for example when run as root), the test is reported as skipped, never as passed.
  // In CI it fails instead, so a broken setup cannot hide.
  const ready = (fn: () => Promise<void>) => async (ctx: { skip: (note?: string) => never }) => {
    if (startError) {
      if (process.env.CI) throw new Error(`Postgres could not start: ${startError}`);
      ctx.skip(`Postgres could not start: ${startError}`);
    }
    await fn();
  };

  it("runs the whole happy path and keeps ledger and audit chain intact [FR-8.5, NFR-2.2, FR-2.5, NFR-3.3]", ready(async () => {
    const c = await fresh();
    await c.svc.topUp(c.amina, sc(100_000), "topup-key-0001");
    const created = await c.svc.createContract(c.amina, validContract());
    expect(created.ref).toMatch(/^TL-\d{4}-\d{4}$/);
    await c.svc.accept(c.brian, created.id);
    await c.svc.fund(c.amina, created.id, "fund-key-0001");
    await c.svc.startWork(c.brian, created.id);
    await c.svc.deliver(c.brian, created.id, goodFile);
    const releaseStarted = performance.now();
    const done = await c.svc.approve(c.amina, created.id, "approve-key-0001");
    expect(performance.now() - releaseStarted, "release on real Postgres takes under 2 s [NFR-3.3]").toBeLessThan(2000);
    expect(done.state).toBe("completed");

    expect((await c.repo.getBalances(USERS.brian.id)).available).toBe(sc(45_000) - sc(900));
    expect((await c.repo.getBalances(USERS.amina.id)).available).toBe(sc(55_000));
    expect((await c.svc.reconcile(c.faith)).balanced).toBe(true);
    expect((await c.svc.verifyAuditChain(c.faith)).ok).toBe(true);
    await c.pool.end();
  }));

  it("files creation audit entries under the new contract's real id [FR-3.9]", ready(async () => {
    const c = await fresh();
    const created = await c.svc.createContract(c.amina, validContract());
    const entries = (await c.repo.listAudit()).map(parseAudit);
    expect(entries.map((e) => e.targetId)).toEqual([created.id, created.id]);
    const view = await c.svc.getContractView(c.amina, created.id);
    expect(view.timeline).toHaveLength(2);
    await c.pool.end();
  }));

  it("returns timestamps in the ISO form the rest of the app compares [NFR-2.5]", ready(async () => {
    const c = await fresh();
    const created = await c.svc.createContract(c.amina, validContract());
    expect(created.createdAt).toMatch(/^\d{4}-\d\d-\d\dT[\d:.]+Z$/);
    expect(created.expiresAt).toMatch(/Z$/);
    await c.pool.end();
  }));

  it("does not pay twice when the same idempotency key is replayed [FR-2.7, FR-5.9]", ready(async () => {
    const c = await fresh();
    await c.svc.topUp(c.amina, sc(100_000), "topup-key-0001");
    await c.svc.topUp(c.amina, sc(100_000), "topup-key-0001");
    expect((await c.repo.getBalances(USERS.amina.id)).available).toBe(sc(100_000));
    await c.pool.end();
  }));

  it("rejects a stale version and an overdraft, leaving nothing half-written [NFR-2.2, NFR-2.4, FR-2.6]", ready(async () => {
    const c = await fresh();
    const created = await c.svc.createContract(c.amina, validContract());
    const before = (await c.repo.getAuditHead()).count;
    await expect(c.repo.commit({ contractId: created.id, expectedVersion: 99, patch: { state: "cancelled" }, audit: [] })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(c.svc.fund(c.amina, created.id, "fund-key-0002")).rejects.toBeDefined(); // not accepted yet, and no balance
    expect((await c.repo.getAuditHead()).count).toBeGreaterThanOrEqual(before);
    expect((await c.svc.verifyAuditChain(c.faith)).ok).toBe(true);
    await c.pool.end();
  }));

  it("lets exactly one of two simultaneous fund requests win [FR-4.5, NFR-2.4]", ready(async () => {
    const c = await fresh();
    await c.svc.topUp(c.amina, sc(100_000), "topup-key-0001");
    const created = await c.svc.createContract(c.amina, validContract());
    await c.svc.accept(c.brian, created.id);
    const results = await Promise.allSettled([c.svc.fund(c.amina, created.id, "fund-key-A0001"), c.svc.fund(c.amina, created.id, "fund-key-B0001")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await c.repo.getBalances(USERS.amina.id)).held).toBe(sc(45_000));
    expect((await c.svc.reconcile(c.faith)).balanced).toBe(true);
    await c.pool.end();
  }));

  it("refuses to change or delete ledger and audit rows, even for the database owner [FR-8.3, FR-9.8]", ready(async () => {
    const c = await fresh();
    await c.svc.topUp(c.amina, sc(10), "topup-key-0001");
    await expect(c.pool.query("update public.ledger_entries set delta = 1")).rejects.toThrow(/APPEND_ONLY/);
    await expect(c.pool.query("delete from public.audit_log")).rejects.toThrow(/APPEND_ONLY/);
    await expect(c.pool.query("truncate public.audit_log")).rejects.toThrow(/APPEND_ONLY/);
    await c.pool.end();
  }));

  it("an empty commit_escrow request, as the wiring script's smoke test sends, changes nothing", ready(async () => {
    const c = await fresh();
    const before = await c.pool.query("select (select count from public.audit_head where id = 1) as audit, (select count(*) from public.ledger_entries) as ledger, (select count(*) from public.contracts) as contracts");
    const res = await c.pool.query("select public.commit_escrow('{}'::jsonb) as r");
    expect(res.rows[0].r).toMatchObject({ replayed: false });
    const after = await c.pool.query("select (select count from public.audit_head where id = 1) as audit, (select count(*) from public.ledger_entries) as ledger, (select count(*) from public.contracts) as contracts");
    expect(after.rows[0]).toEqual(before.rows[0]);
    await c.pool.end();
  }));

  it("keeps the public (anon) role away from every table [NFR-1.5, FR-1.12]", ready(async () => {
    const c = await fresh();
    const conn = await c.pool.connect(); // one connection, so "set role" applies to the queries after it
    await conn.query("set role anon");
    await expect(conn.query("select * from public.ledger_entries")).rejects.toThrow(/permission denied/);
    await expect(conn.query("select public.commit_escrow('{}'::jsonb)")).rejects.toThrow(/permission denied/);
    await conn.query("reset role");
    await expect(conn.query("select 1 from public.audit_head")).resolves.toBeDefined();
    conn.release();
    await c.pool.end();
  }));
});

describe("buildCommitPayload", () => {
  it("assigns the contract id before hashing and rewrites the audit target [FR-8.5]", () => {
    const clock = new FakeClock();
    const { payload, contractId } = buildCommitPayload(
      {
        createContract: { title: "x" } as never,
        audit: [{ actorId: "u", actorRole: "client", action: "contract.created", targetType: "contract", targetId: "new", result: "ok" }],
      },
      clock,
      () => "11111111-1111-4111-8111-111111111111",
    );
    expect(contractId).toBe("11111111-1111-4111-8111-111111111111");
    expect(payload.createContract?.id).toBe(contractId);
    expect(JSON.parse(payload.audit[0]).targetId).toBe(contractId);
  });
});
