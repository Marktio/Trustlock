import { timingSafeEqual } from "node:crypto";
import type { Container } from "./container";

/** What the scheduler last did. Kept in memory: it is only for the health check, the audit log has the real record. */
export interface SchedulerStatus {
  lastRunAt: string | null;
  lastResult: { released: number; expired: number; skipped: number } | null;
  lastError: string | null;
}

const g = globalThis as unknown as { __trustlockScheduler?: SchedulerStatus };
export const schedulerStatus = (): SchedulerStatus => (g.__trustlockScheduler ??= { lastRunAt: null, lastResult: null, lastError: null });

/** True when the Authorization header carries the shared secret. With no secret configured nothing is accepted (fail closed). */
export function cronAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const want = Buffer.from(secret);
  return given.length === want.length && timingSafeEqual(given, want);
}

export interface Health {
  status: "ok" | "degraded";
  checks: { api: "ok"; database: "ok" | "down"; scheduler: "ok" | "failing" | "not_run_yet" };
  scheduler: SchedulerStatus;
  checkedAt: string;
}

/** Health for the API, the database and the scheduler (NFR-4.4). Contains no user data, so it is safe to leave public. */
export async function checkHealth(container: Container, now: Date): Promise<Health> {
  let database: "ok" | "down" = "ok";
  try {
    await container.repo.getAuditHead();
  } catch {
    database = "down";
  }
  const sched = schedulerStatus();
  const scheduler = sched.lastError ? "failing" : sched.lastRunAt ? "ok" : "not_run_yet";
  return {
    status: database === "ok" && scheduler !== "failing" ? "ok" : "degraded",
    checks: { api: "ok", database, scheduler },
    scheduler: sched,
    checkedAt: now.toISOString(),
  };
}

/** Runs the timed jobs once and records the outcome for the health check. */
export async function triggerScheduler(container: Container, now: Date) {
  const status = schedulerStatus();
  try {
    const result = await container.svc.runScheduler();
    status.lastRunAt = now.toISOString();
    status.lastResult = result;
    status.lastError = null;
    return { ok: true as const, ...result };
  } catch (e) {
    status.lastRunAt = now.toISOString();
    status.lastError = e instanceof Error ? e.message : "unknown error";
    return { ok: false as const, error: "The scheduler run failed. See the server log." };
  }
}
