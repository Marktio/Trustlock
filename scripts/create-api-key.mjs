// Makes an API key for a developer platform and saves its hash in Supabase. The key is shown ONCE; only the hash is stored.
// New platform:      node --env-file=.env.local scripts/create-api-key.mjs --label "Acme Marketplace"
// Another key for a platform you already made:   ... --label "Acme staging" --platform abc123def456
// A test-mode key (its own separate users and data): ... --label "Acme sandbox" --mode test
// Try it without saving anything:                ... --label test --dry-run
import { createHash, randomBytes, randomUUID } from "node:crypto";

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const dryRun = args.includes("--dry-run");
const label = (flag("label") ?? "").trim();
const mode = flag("mode") ?? "live";
const platformId = flag("platform") ?? Array.from(randomBytes(12), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");

if (!label || !/^[a-z0-9]{12}$/.test(platformId) || !["live", "test"].includes(mode)) {
  console.error('Usage: node --env-file=.env.local scripts/create-api-key.mjs --label "Name of the app" [--mode live|test] [--platform <12 letters/digits>] [--dry-run]');
  process.exit(1);
}

const secret = `tlk_${mode}_` + randomBytes(32).toString("base64url");
const record = { id: randomUUID(), platform_id: platformId, mode, label: label.slice(0, 80), prefix: secret.slice(0, 13), key_hash: createHash("sha256").update(secret).digest("hex") };

if (!dryRun) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (in .env.local). Without a database, use TRUSTLOCK_DEV_API_KEY for local tries.");
    process.exit(1);
  }
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await db.from("api_keys").insert(record);
  if (error) {
    console.error(`Could not save the key: ${error.message}${/api_keys/.test(error.message) ? "\nRun npm run wire:db first so migration 0003 is applied." : ""}`);
    process.exit(1);
  }
}

console.log(`${dryRun ? "(dry run, nothing saved) " : ""}Platform: ${platformId}   Mode: ${mode}`);
console.log(`API key:  ${secret}`);
console.log("Copy it now. It cannot be shown again, and TrustLock keeps only a hash of it.");
