-- TrustLock schema. Simulation only: no real money.
-- Apply with the Supabase SQL editor or `supabase db push`.
-- The app talks to this database only from the server, with the service role key.
-- Row Level Security is switched on with no policies, so the public (anon) API can read and write nothing.

create extension if not exists pgcrypto with schema extensions;

-- ---------- Tables ----------

create table public.profiles (
  id          text primary key,                -- Clerk user id
  name        text not null check (char_length(name) between 1 and 120),
  email       text not null unique,
  role        text not null check (role in ('client','freelancer','arbitrator','admin','auditor')),
  created_at  timestamptz not null default now()
);

create sequence public.contract_ref_seq;

create table public.contracts (
  id                   uuid primary key,
  ref                  text not null unique default
                         ('TL-' || to_char(now() at time zone 'utc', 'YYYY') || '-' || lpad(nextval('public.contract_ref_seq')::text, 4, '0')),
  title                text not null check (char_length(title) between 3 and 120),
  description          text not null check (char_length(description) between 1 and 2000),
  client_id            text not null references public.profiles(id),
  freelancer_id        text not null references public.profiles(id),
  amount               bigint not null check (amount > 0),            -- integer minor units, 100 = 1 SC
  fee_bps              int not null check (fee_bps between 0 and 2000),
  state                text not null check (state in (
                         'draft','proposed','accepted','funded','in_progress','delivered','approved','completed',
                         'disputed','refunded','resolved_split','rejected','cancelled','expired')),
  version              int not null default 1,
  milestones           jsonb not null,
  review_period_days   int not null check (review_period_days between 1 and 14),
  revision_limit       int not null check (revision_limit between 0 and 5),
  revisions_used       int not null default 0 check (revisions_used >= 0),
  expires_at           timestamptz,
  delivered_at         timestamptz,
  review_ends_at       timestamptz,
  deliverable          jsonb,
  revision_reason      text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (client_id <> freelancer_id)
);
create index contracts_client_idx on public.contracts (client_id);
create index contracts_freelancer_idx on public.contracts (freelancer_id);
create index contracts_state_idx on public.contracts (state);

create table public.ledger_entries (
  id          bigint generated always as identity primary key,
  tx_id       uuid not null,
  account     text not null,
  delta       bigint not null check (delta <> 0),
  memo        text not null default '',
  contract_id uuid references public.contracts(id),
  created_at  timestamptz not null default now()
);
create index ledger_account_idx on public.ledger_entries (account);

create table public.audit_log (
  seq        bigint primary key,
  payload    text not null,                    -- the exact text that was hashed
  prev_hash  text not null,
  hash       text not null unique,
  created_at timestamptz not null default now()
);

create table public.audit_head (
  id    int primary key check (id = 1),
  count bigint not null,
  hash  text not null
);
insert into public.audit_head (id, count, hash) values (1, 0, repeat('0', 64));

create table public.idempotency_keys (
  key         text primary key,
  contract_id uuid,
  created_at  timestamptz not null default now()
);

-- ---------- Append-only: ledger and audit rows can never be changed or removed (FR-8.3, FR-9.8) ----------

create function public.forbid_change() returns trigger language plpgsql as $$
begin
  raise exception 'APPEND_ONLY: % on % is not allowed', tg_op, tg_table_name using errcode = '42501';
end $$;

create trigger ledger_append_only before update or delete on public.ledger_entries
  for each row execute function public.forbid_change();
create trigger ledger_no_truncate before truncate on public.ledger_entries
  for each statement execute function public.forbid_change();
create trigger audit_append_only before update or delete on public.audit_log
  for each row execute function public.forbid_change();
create trigger audit_no_truncate before truncate on public.audit_log
  for each statement execute function public.forbid_change();

-- ---------- Row Level Security: on, with no policies ----------

alter table public.profiles          enable row level security;
alter table public.contracts         enable row level security;
alter table public.ledger_entries    enable row level security;
alter table public.audit_log         enable row level security;
alter table public.audit_head        enable row level security;
alter table public.idempotency_keys  enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ---------- The one atomic write ----------
-- Everything below happens in a single transaction: contract change, ledger postings, idempotency key and audit entries.
-- Lock order is always: idempotency key, contract row, accounts (sorted), audit head. This avoids deadlocks.
--
-- Request shape (built by SupabaseRepository):
--   { idempotencyKey, createContract: {...}|null, contractId, expectedVersion, patch: {...}|null,
--     postings: [{account, delta}], memo, audit: ["<payload text>", ...] }

create or replace function public.commit_escrow(req jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key         text := req->>'idempotencyKey';
  v_contract_id uuid;
  v_cur         public.contracts%rowtype;
  v_patch       jsonb := coalesce(req->'patch', '{}'::jsonb);
  v_create      jsonb := req->'createContract';
  v_tx          uuid := gen_random_uuid();
  v_posting     jsonb;
  v_sum         bigint;
  v_balance     bigint;
  v_account     text;
  v_payload     text;
  v_head        public.audit_head%rowtype;
  v_hash        text;
begin
  -- 1. Idempotency: a repeated key returns the first result and changes nothing (FR-2.7).
  if v_key is not null then
    perform pg_advisory_xact_lock(hashtext('idem:' || v_key));
    select contract_id into v_contract_id from public.idempotency_keys where key = v_key;
    if found then
      return jsonb_build_object('replayed', true, 'contractId', v_contract_id);
    end if;
  end if;

  -- 2. Contract: create, or update with an optimistic version check (NFR-2.4).
  if v_create is not null and jsonb_typeof(v_create) = 'object' then
    v_contract_id := (v_create->>'id')::uuid;
    insert into public.contracts (
      id, title, description, client_id, freelancer_id, amount, fee_bps, state, milestones,
      review_period_days, revision_limit, revisions_used, expires_at, created_at, updated_at
    ) values (
      v_contract_id, v_create->>'title', v_create->>'description', v_create->>'clientId', v_create->>'freelancerId',
      (v_create->>'amount')::bigint, (v_create->>'feeBps')::int, v_create->>'state', v_create->'milestones',
      (v_create->>'reviewPeriodDays')::int, (v_create->>'revisionLimit')::int, 0,
      nullif(v_create->>'expiresAt', '')::timestamptz, now(), now()
    );
  elsif req->>'contractId' is not null then
    v_contract_id := (req->>'contractId')::uuid;
    select * into v_cur from public.contracts where id = v_contract_id for update;
    if not found then
      raise exception 'NOT_FOUND' using errcode = 'P0002';
    end if;
    if v_cur.version <> (req->>'expectedVersion')::int then
      raise exception 'CONFLICT' using errcode = 'P0001';
    end if;
    update public.contracts set
      state           = case when v_patch ? 'state'          then v_patch->>'state'                                  else state end,
      revisions_used  = case when v_patch ? 'revisionsUsed'  then (v_patch->>'revisionsUsed')::int                   else revisions_used end,
      expires_at      = case when v_patch ? 'expiresAt'      then nullif(v_patch->>'expiresAt', '')::timestamptz     else expires_at end,
      delivered_at    = case when v_patch ? 'deliveredAt'    then nullif(v_patch->>'deliveredAt', '')::timestamptz   else delivered_at end,
      review_ends_at  = case when v_patch ? 'reviewEndsAt'   then nullif(v_patch->>'reviewEndsAt', '')::timestamptz  else review_ends_at end,
      deliverable     = case when v_patch ? 'deliverable'    then nullif(v_patch->'deliverable', 'null'::jsonb)      else deliverable end,
      revision_reason = case when v_patch ? 'revisionReason' then v_patch->>'revisionReason'                         else revision_reason end,
      version         = version + 1,
      updated_at      = now()
    where id = v_contract_id;
  else
    v_contract_id := null;
  end if;

  -- 3. Ledger: balanced postings, wallets never negative (FR-2.5, FR-2.6).
  if jsonb_array_length(coalesce(req->'postings', '[]'::jsonb)) > 0 then
    select coalesce(sum((p->>'delta')::bigint), 0) into v_sum from jsonb_array_elements(req->'postings') p;
    if v_sum <> 0 then
      raise exception 'UNBALANCED' using errcode = 'P0001';
    end if;
    -- Lock each account in a fixed order, then check and insert.
    for v_posting in select p from jsonb_array_elements(req->'postings') p order by p->>'account' loop
      v_account := v_posting->>'account';
      perform pg_advisory_xact_lock(hashtext('acct:' || v_account));
    end loop;
    for v_posting in select p from jsonb_array_elements(req->'postings') p loop
      v_account := v_posting->>'account';
      if v_account like 'wallet:%' then
        select coalesce(sum(delta), 0) into v_balance from public.ledger_entries where account = v_account;
        if v_balance + (v_posting->>'delta')::bigint < 0 then
          raise exception 'INSUFFICIENT_FUNDS' using errcode = 'P0001';
        end if;
      end if;
      insert into public.ledger_entries (tx_id, account, delta, memo, contract_id)
      values (v_tx, v_account, (v_posting->>'delta')::bigint, coalesce(req->>'memo', ''), v_contract_id);
    end loop;
  end if;

  -- 4. Audit: hash-chained, written in the same transaction as the change it describes (FR-8.5).
  if jsonb_array_length(coalesce(req->'audit', '[]'::jsonb)) > 0 then
    select * into v_head from public.audit_head where id = 1 for update;
    for v_payload in select value from jsonb_array_elements_text(req->'audit') loop
      v_hash := encode(digest(v_head.hash || v_payload, 'sha256'), 'hex');
      insert into public.audit_log (seq, payload, prev_hash, hash) values (v_head.count + 1, v_payload, v_head.hash, v_hash);
      v_head.count := v_head.count + 1;
      v_head.hash  := v_hash;
    end loop;
    update public.audit_head set count = v_head.count, hash = v_head.hash where id = 1;
  end if;

  if v_key is not null then
    insert into public.idempotency_keys (key, contract_id) values (v_key, v_contract_id);
  end if;

  return jsonb_build_object('replayed', false, 'contractId', v_contract_id);
end $$;

revoke all on function public.commit_escrow(jsonb) from public, anon, authenticated;
grant execute on function public.commit_escrow(jsonb) to service_role;

-- Private bucket for deliverables (planned: file storage is not wired up yet).
-- insert into storage.buckets (id, name, public) values ('deliverables', 'deliverables', false);
