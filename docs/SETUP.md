# Setup with Clerk and Supabase

**Fastest path:** put your keys in `.env.local`, then double-click `WIRE_DB.bat` (or run `npm run wire:db`). It checks the Clerk and Supabase keys, applies any missing SQL (0001, then 0002) and runs a smoke test. Add `SUPABASE_ACCESS_TOKEN=sbp_...` to `.env.local` if you want it to apply the SQL for you. Use `npm run wire:db:check` to only look.

Both services are used together: **Clerk = who you are (login), Supabase = where the data lives.**

Use test accounts. Keys stay on your computer in `.env.local` (already git-ignored). Never paste the Supabase service role key anywhere public.

## 1. Clerk (login)
1. clerk.com → sign up → **Create application** → name it TrustLock → tick **Email** (Google optional).
2. **Configure → API keys**: copy the Publishable key (`pk_test_…`) and Secret key (`sk_test_…`).
3. Copy `.env.example` to `.env.local` and paste the two keys. The other `NEXT_PUBLIC_CLERK_*` lines in it already point at TrustLock's own `/sign-in` and `/sign-up` pages, so leave them.
4. In Clerk, **Configure → Paths**, choose "Application paths" for the same pages if it asks.

How people get in: on the home page they press **Register as client** or **Register as freelancer**. That opens `/sign-up?role=…`, Clerk's form (themed in `src/components/clerk-theme.ts`) creates the account, and `/onboarding` then opens with that role already ticked for them to confirm. A role can be set once. **Log in** opens `/sign-in`.

## 2. Supabase and `.env.local` with DB Control Center
1. In Supabase, make a personal access token (Account → Access Tokens, starts `sbp_`) and note your Organization ID.
2. Open DB Control Center → Settings → add the token and organization ID.
3. Provision a new Supabase project. Choose this project's `supabase/migrations/0001_init.sql` as the SQL file and this project's folder as the target folder.
   It creates the project, runs the SQL, and writes `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` into `.env.local`.
   TrustLock reads the URL and the service role key; it never uses the anon key.
4. In the Control Center's Login screen choose Clerk and paste the two Clerk keys. It writes them into the same `.env.local`.

No Control Center? Create the project at supabase.com, paste `0001_init.sql`, then `0002_counter_proposals.sql`, into **SQL Editor → Run**, and copy `.env.example` to `.env.local` by hand.

## 3. Run
```bash
npm install
npm run dev
```
Set `TRUSTLOCK_SEED_DEMO=true` once if you want the demo contracts in the new database. Real users appear when they sign in.

## 4. Make the staff accounts
Clients and freelancers choose their role at `/onboarding`. For arbitrator, admin and auditor, open the user in the Clerk dashboard → **Metadata → Public** and set `{"role": "admin"}` (or `arbitrator`, `auditor`).

## Not yet tested
Clerk sign-in, sign-up, the role hand-off from the home page, and role handling, and the adapter against a real Supabase project, have only been checked by tests and a stand-in, not with live keys. If something fails on first run, tell me the error and I will fix it.

## Making the first administrator (Clerk mode)

People who sign up become clients or freelancers. Staff roles are given afterwards. The first administrator signs up once, then you run:

```bash
node --env-file=.env.local scripts/set-role.mjs you@example.com admin
```

Roles are `client`, `freelancer`, `arbitrator`, `admin` and `auditor`. The script sets `publicMetadata.role` through Clerk's API and is safe to repeat; the person may need to refresh. After that, the administrator can create arbitrator and auditor accounts from the admin dashboard.
