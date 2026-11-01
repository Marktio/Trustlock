-- Counter-proposals (FR-3.3): while a contract is Proposed, the freelancer can change the price, milestones,
-- review period and revision limit. commit_escrow now accepts those fields in `patch`.
-- Terms are still frozen once funded, because the service never sends these fields after that point.
-- Everything else in the function is unchanged from 0001.

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
      amount             = case when v_patch ? 'amount'           then (v_patch->>'amount')::bigint            else amount end,
      milestones         = case when v_patch ? 'milestones'       then v_patch->'milestones'                   else milestones end,
      review_period_days = case when v_patch ? 'reviewPeriodDays' then (v_patch->>'reviewPeriodDays')::int     else review_period_days end,
      revision_limit     = case when v_patch ? 'revisionLimit'    then (v_patch->>'revisionLimit')::int        else revision_limit end,
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
