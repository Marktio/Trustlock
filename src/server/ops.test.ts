import { describe, expect, it } from "vitest";
import { setup } from "@/test/helpers";
import { checkHealth, cronAuthorized, schedulerStatus, triggerScheduler } from "./ops";

const SECRET = "a-long-enough-secret-123";

describe("scheduler endpoint security [NFR-4.4, FR-5.7]", () => {
  it("accepts only the exact bearer secret and fails closed without one", () => {
    expect(cronAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(cronAuthorized(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(cronAuthorized(SECRET, SECRET)).toBe(false);
    expect(cronAuthorized(null, SECRET)).toBe(false);
    expect(cronAuthorized(`Bearer ${SECRET}`, undefined)).toBe(false);
    expect(cronAuthorized("Bearer short", "short")).toBe(false);
  });
});

describe("health check [NFR-4.4]", () => {
  it("reports api, database and scheduler, and degrades when the database fails or the scheduler errors", async () => {
    const ctx = await setup();
    const container = { svc: ctx.svc, repo: ctx.repo };
    Object.assign(schedulerStatus(), { lastRunAt: null, lastResult: null, lastError: null });
    const first = await checkHealth(container, ctx.clock.now());
    expect(first).toMatchObject({ status: "ok", checks: { api: "ok", database: "ok", scheduler: "not_run_yet" } });

    expect(await triggerScheduler(container, ctx.clock.now())).toMatchObject({ ok: true, released: 0 });
    expect((await checkHealth(container, ctx.clock.now())).checks.scheduler).toBe("ok");

    const broken = { svc: ctx.svc, repo: { ...ctx.repo, getAuditHead: async () => { throw new Error("down"); } } as never };
    const down = await checkHealth(broken, ctx.clock.now());
    expect(down.status).toBe("degraded");
    expect(down.checks.database).toBe("down");
    expect(JSON.stringify(down)).not.toMatch(/amina|email|password/i);

    const failing = { svc: { runScheduler: async () => { throw new Error("boom"); } } as never, repo: ctx.repo };
    expect(await triggerScheduler(failing, ctx.clock.now())).toMatchObject({ ok: false });
    expect((await checkHealth(container, ctx.clock.now())).status).toBe("degraded");
    Object.assign(schedulerStatus(), { lastRunAt: null, lastResult: null, lastError: null });
  });
});
