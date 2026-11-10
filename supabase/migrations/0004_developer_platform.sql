-- Developer platform, part 2: test/live keys, key owners, webhooks and the request log. Simulation only.
-- Apply after 0003 (npm run wire:db does it). Safe to run twice.

alter table public.api_keys add column if not exists mode text not null default 'live' check (mode in ('test', 'live'));
alter table public.api_keys add column if not exists owner_id text;
create index if not exists api_keys_owner_idx on public.api_keys (owner_id);

-- Where a platform wants to be told about changes. "namespace" is the platform id, plus "-test" for test keys.
create table if not exists public.webhook_endpoints (
  id         uuid primary key,
  namespace  text not null,
  url        text not null check (char_length(url) <= 500),
  secret     text not null,                       -- signs every delivery, so it must be readable by the server
  events     text[] not null default array['*'],
  enabled    boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists webhook_endpoints_ns_idx on public.webhook_endpoints (namespace);

-- One row per event per endpoint. The unique key means scanning the audit log twice can never queue an event twice.
create table if not exists public.webhook_deliveries (
  id              uuid primary key,
  endpoint_id     uuid not null references public.webhook_endpoints(id) on delete cascade,
  namespace       text not null,
  event_id        text not null,
  type            text not null,
  payload         text not null,
  status          text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  attempts        int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_status     int,
  last_error      text,
  created_at      timestamptz not null default now(),
  delivered_at    timestamptz,
  unique (endpoint_id, event_id)
);
create index if not exists webhook_deliveries_due_idx on public.webhook_deliveries (status, next_attempt_at);

-- How far the webhook scanner has read in the (append-only) audit log.
create table if not exists public.platform_cursors (
  name  text primary key,
  value bigint not null
);

-- What each platform called and how it went, so a developer can see why a call failed. Pruned after 30 days.
create table if not exists public.api_request_logs (
  id        uuid primary key,
  namespace text not null,
  key_id    uuid not null,
  method    text not null,
  path      text not null,
  status    int not null,
  code      text,
  ms        int not null,
  at        timestamptz not null default now()
);
create index if not exists api_request_logs_ns_idx on public.api_request_logs (namespace, at desc);

alter table public.webhook_endpoints  enable row level security;
alter table public.webhook_deliveries enable row level security;
alter table public.platform_cursors   enable row level security;
alter table public.api_request_logs   enable row level security;
revoke all on public.webhook_endpoints, public.webhook_deliveries, public.platform_cursors, public.api_request_logs from anon, authenticated;
