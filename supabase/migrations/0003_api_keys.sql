-- API keys for developer platforms. Simulation only: no real money.
-- A platform is an outside app that calls /api/v1 from its own server. Only a SHA-256 hash of each key is stored,
-- so a leaked database cannot be used to call the API. Platform users need no table: they are rows in public.profiles
-- whose id is 'x_<platform_id>_<their id in the platform>'.
-- Apply with the Supabase SQL editor or `supabase db push`, after 0001 and 0002. Safe to run twice.

create table if not exists public.api_keys (
  id          uuid primary key default gen_random_uuid(),
  platform_id text not null check (platform_id ~ '^[a-z0-9]{12}$'),
  label       text not null check (char_length(label) between 1 and 80),
  prefix      text not null,                      -- first characters of the key, for telling keys apart in a list
  key_hash    text not null unique,               -- sha256 hex of the full key
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);
create index if not exists api_keys_platform_idx on public.api_keys (platform_id);

alter table public.api_keys enable row level security;
revoke all on public.api_keys from anon, authenticated;
