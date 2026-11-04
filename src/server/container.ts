import { DEFAULT_CONFIG, EscrowService } from "@/domain/escrow-service";
import { SimulatedGateway } from "@/domain/gateway";
import type { EscrowRepository } from "@/domain/repository";
import type { Clock } from "@/domain/types";
import { createClient } from "@supabase/supabase-js";
import { seedDemo } from "./demo-data";
import { MemoryRepository } from "./memory-repository";
import { SupabaseRepository } from "./supabase-repository";

export interface Container {
  svc: EscrowService;
  repo: EscrowRepository;
}

const systemClock: Clock = { now: () => new Date() };

/** Supabase is used when its URL and service role key are set. Otherwise data lives in memory and resets on restart. */
export function supabaseSettings(env: NodeJS.ProcessEnv = process.env) {
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

/**
 * Next.js remembers identical GET fetches during one render, so reading a contract twice returned the first answer
 * even after it had changed. A money app must always read the current row: no-store, plus a signal (which turns the memo off).
 */
export function freshFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  return fetch(input, { ...init, cache: "no-store", signal: init.signal ?? AbortSignal.timeout(30_000) });
}

async function build(): Promise<Container> {
  const sb = supabaseSettings();
  // Real sign in with in-memory data would lose every account and contract on each restart, so refuse to start that way.
  if (!sb && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY && process.env.NODE_ENV === "production") {
    throw new Error("Real sign in is on but Supabase is not set up. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or data will vanish on restart.");
  }
  const repo: EscrowRepository = sb
    ? new SupabaseRepository(createClient(sb.url, sb.key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: freshFetch } }), systemClock)
    : new MemoryRepository(systemClock);
  const svc = new EscrowService(repo, systemClock, new SimulatedGateway("success"), DEFAULT_CONFIG);
  // Memory mode seeds the demo unless told not to. A real database is seeded only when asked, and only if it is still empty.
  const wantSeed = sb ? process.env.TRUSTLOCK_SEED_DEMO === "true" && (await repo.getAuditHead()).count === 0 : process.env.TRUSTLOCK_SEED_DEMO !== "false";
  if (wantSeed) await seedDemo(svc, repo);
  return { svc, repo };
}

// Kept on globalThis so hot reloads in development do not wipe the data.
const g = globalThis as unknown as { __trustlock?: Promise<Container> };

export function getContainer(): Promise<Container> {
  // A failed build is not kept, so the next request tries again instead of failing until restart.
  g.__trustlock ??= build().catch((e) => {
    g.__trustlock = undefined;
    throw e;
  });
  return g.__trustlock;
}
