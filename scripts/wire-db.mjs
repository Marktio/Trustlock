#!/usr/bin/env node
// TrustLock database wiring: checks Clerk + Supabase keys, applies the SQL that is missing, runs a smoke test.
// Safe to run twice: it only applies what is missing and never drops or overwrites data.
// Usage:  node scripts/wire-db.mjs            (check + apply what is missing)
//         node scripts/wire-db.mjs --check    (check only, change nothing)
import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const tfetch = (u, o = {}) => fetch(u, { ...o, signal: AbortSignal.timeout(15000) }); // never hang
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");
const results = [];
const say = (ok, msg) => { results.push(ok); console.log(`${ok === null ? "  - " : ok ? "  OK  " : "  FAIL"} ${msg}`); };

export function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#")) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
export const projectRef = (url) => (url.match(/^https:\/\/([a-z0-9]{20})\.supabase\.co/i) || [])[1] || null;

async function main() {
  const envPath = join(root, ".env.local");
  const env = { ...(existsSync(envPath) ? parseEnv(readFileSync(envPath, "utf8")) : {}), ...process.env };
  console.log(`\nTrustLock database wiring${checkOnly ? " (check only)" : ""}\n`);
  if (!existsSync(envPath)) say(false, ".env.local not found. Copy .env.example to .env.local and fill it in.");

  // ---- Clerk (login) ----
  const pk = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, sk = env.CLERK_SECRET_KEY;
  if (!pk || !sk) say(null, "Clerk keys not set: app will run in demo mode (seeded accounts). Fine for testing, not for real login.");
  else {
    say(/^pk_(test|live)_/.test(pk) && /^sk_(test|live)_/.test(sk), "Clerk keys have the right shape");
    if (/_live_/.test(pk + sk)) say(false, "Live Clerk keys found. Use pk_test_/sk_test_ for a simulator.");
    try {
      const r = await tfetch("https://api.clerk.com/v1/users?limit=1", { headers: { Authorization: `Bearer ${sk}` } });
      say(r.ok, r.ok ? "Clerk accepted the secret key" : `Clerk rejected the secret key (HTTP ${r.status})`);
    } catch (e) { say(null, `Could not reach Clerk (${e.message}). Skipped.`); }
  }

  // DB Control Center writes only the two Clerk keys. Without these four lines Clerk sends people to its own hosted pages
  // and the sign-up -> /onboarding role hand-off breaks. Adding missing lines is safe: existing lines are never changed.
  if (pk && sk && existsSync(envPath)) {
    const want = { NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/sign-in", NEXT_PUBLIC_CLERK_SIGN_UP_URL: "/sign-up",
      NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: "/dashboard", NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: "/onboarding" };
    const have = parseEnv(readFileSync(envPath, "utf8"));
    const missing = Object.keys(want).filter((k) => !have[k]);
    if (!missing.length) say(true, "Clerk page/redirect settings present");
    else if (checkOnly) say(false, `Clerk redirect settings missing: ${missing.join(", ")}. Run without --check to add them.`);
    else { appendFileSync(envPath, "\n" + missing.map((k) => `${k}=${want[k]}`).join("\n") + "\n"); say(true, `Added missing Clerk settings: ${missing.join(", ")}`); }
  }

  // ---- Supabase ----
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { say(false, "Supabase URL or SUPABASE_SERVICE_ROLE_KEY missing in .env.local"); return finish(); }
  const ref = projectRef(url);
  const base = env.SUPABASE_API_BASE || "https://api.supabase.com";
  const token = env.SUPABASE_ACCESS_TOKEN;
  const sql = (q) => tfetch(`${base}/v1/projects/${ref}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: q }),
  }).then(async (r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${await r.text()}`); return r.json(); });

  let hasSchema = false, has0002 = false, has0003 = false, has0004 = false;
  if (token && ref) {
    try {
      const [row] = await sql(`select to_regclass('public.profiles') is not null as has_schema,
        coalesce((select prosrc like '%review_period_days = case%' from pg_proc where proname = 'commit_escrow' limit 1), false) as has_0002,
        to_regclass('public.api_keys') is not null as has_0003,
        to_regclass('public.api_request_logs') is not null as has_0004`);
      hasSchema = row.has_schema; has0002 = row.has_0002; has0003 = row.has_0003; has0004 = row.has_0004;
      say(true, `Database reachable through the Management API (schema: ${hasSchema ? "present" : "missing"}, counter-proposals: ${has0002 ? "present" : "missing"})`);
      if (!checkOnly) {
        if (!hasSchema) { await sql(readFileSync(join(root, "supabase/migrations/0001_init.sql"), "utf8")); say(true, "Applied 0001_init.sql"); has0002 = false; has0003 = false; has0004 = false; }
        if (!has0002) { await sql(readFileSync(join(root, "supabase/migrations/0002_counter_proposals.sql"), "utf8")); say(true, "Applied 0002_counter_proposals.sql"); }
        if (!has0003) { await sql(readFileSync(join(root, "supabase/migrations/0003_api_keys.sql"), "utf8")); say(true, "Applied 0003_api_keys.sql (developer API keys)"); has0004 = false; }
        if (!has0004) { await sql(readFileSync(join(root, "supabase/migrations/0004_developer_platform.sql"), "utf8")); say(true, "Applied 0004_developer_platform.sql (webhooks, test keys, API log)"); }
      } else if (!hasSchema || !has0002 || !has0003 || !has0004) say(false, "SQL is missing. Run without --check to apply it.");
    } catch (e) { say(false, `Management API call failed: ${e.message}`); }
  } else say(null, "No SUPABASE_ACCESS_TOKEN (sbp_...) in .env.local, so SQL cannot be applied automatically. Checking tables only.");

  // ---- Smoke test with the same client the app uses ----
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: tfetch } });
  const head = await sb.from("audit_head").select("count,hash").eq("id", 1).maybeSingle();
  if (head.error) say(false, `Cannot read audit_head: ${head.error.message}. The schema is probably not applied yet.`);
  else say(!!head.data, `App can read the database (audit entries so far: ${head.data?.count ?? "?"})`);
  const rpc = await sb.rpc("commit_escrow", { req: {} }); // an empty request is a harmless no-op
  say(!rpc.error && rpc.data?.replayed === false, rpc.error ? `commit_escrow failed: ${rpc.error.message}` : "commit_escrow (the atomic write) responds");
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (anon) {
    const pub = await createClient(url, anon, { auth: { persistSession: false }, global: { fetch: tfetch } }).from("profiles").select("id").limit(1);
    say(!!pub.error || (pub.data ?? []).length === 0, "Public (anon) key can read no rows from profiles");
  }
  finish();
}
function finish() {
  const bad = results.filter((r) => r === false).length;
  console.log(bad ? `\n${bad} problem(s). Fix them and run again.\n` : "\nAll good. Run: npm run dev   (set TRUSTLOCK_SEED_DEMO=true once for demo contracts)\n");
  process.exitCode = bad ? 1 : 0;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
