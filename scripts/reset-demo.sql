-- Wipes ALL TrustLock data (contracts, ledger, audit log, users) so the demo can be seeded again.
-- Run it in Supabase: SQL Editor > New query > paste > Run. Only for a throwaway test project.
alter table public.ledger_entries disable trigger user;
alter table public.audit_log disable trigger user;
truncate public.contracts, public.ledger_entries, public.audit_log, public.idempotency_keys, public.profiles;
alter table public.ledger_entries enable trigger user;
alter table public.audit_log enable trigger user;
update public.audit_head set count = 0, hash = repeat('0', 64) where id = 1;
