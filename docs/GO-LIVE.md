# Going live: real accounts and a real database

This moves TrustLock off demo mode. Sign in is real (Clerk), data is kept (Supabase), and the site is public (Vercel). Money is still practice credits.

Never paste a secret key into a chat, an issue or a commit. Keys go only into `.env.local` on your computer and into Vercel's environment variables.

## 1. Supabase (the database)
1. Create a project at supabase.com. Note the project URL (Project Settings, API) and the **service_role** key.
2. SQL Editor: run `supabase/migrations/0001_init.sql`, then `0002_counter_proposals.sql`.
3. Or put the keys in `.env.local` and run `npm run wire:db` (add `SUPABASE_ACCESS_TOKEN` to let it apply the SQL).

## 2. Clerk (sign in)
1. Create an application, enable **Email**. Copy the publishable and secret keys.
2. `pk_test_` and `sk_test_` keys work for the class demo. For a custom domain use a Production instance (`pk_live_`) and add your domain in Clerk.
3. In Clerk, add your Vercel URL to the allowed origins if it asks.

## 3. Test it on your computer first
```bash
cp .env.example .env.local     # fill in the Clerk and Supabase values, set CRON_SECRET
npm install
npm run wire:db:check
npm run dev
```
Open http://localhost:3000. `/demo` should now show "not found". Register as a client, then confirm the role on `/onboarding`.

## 4. First administrator
Sign up once with your own email, then:
```bash
node --env-file=.env.local scripts/set-role.mjs you@example.com admin
```
Refresh. The admin dashboard at `/admin` can then create arbitrator and auditor accounts.

## 5. Deploy on Vercel
1. Push the project to GitHub (see `docs/GITHUB-SETUP.md`).
2. vercel.com, Add New, Project, import the repository. Framework is detected as Next.js.
3. Environment Variables (Production), same names as `.env.example`:
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, the four `NEXT_PUBLIC_CLERK_*_URL` lines, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `TRUSTLOCK_SEED_DEMO=false`.
   Do not add `SUPABASE_ACCESS_TOKEN`.
4. Deploy. Open `https://<your-app>.vercel.app/api/health`. It should return `ok`.
   If it says Supabase is not set up, a variable is missing. The app refuses to run real sign in without a database so data is never lost on restart.

## 6. Timed jobs
Auto approval and expiry need something to call `/api/cron/scheduler`. Vercel's free plan only allows daily cron, so use the included GitHub workflow:
GitHub repository, Settings, Secrets and variables, Actions, add `APP_URL` (your Vercel URL, no trailing slash) and `CRON_SECRET` (same value as in Vercel). The Scheduler workflow then runs every 5 minutes. Run it once by hand from the Actions tab to check it succeeds.

## 7. Smoke test on the live site
- Two browsers (or one normal, one private): register a client and a freelancer.
- Client creates a contract, freelancer accepts, client funds it, freelancer delivers, client approves.
- Check the wallet balances, `/audit` (admin or auditor), and that restarting or redeploying keeps the contract.
- `/privacy` and `/terms` open without signing in.

## Known limits
- The rate limiter keeps its counts in memory, so on Vercel each server instance counts separately. It slows abuse but is not a hard limit.
- File upload stores only name, size and SHA-256. Files themselves are not stored.
- Simulated emails stay in the admin mail catcher. Nothing is sent to real mailboxes.
- Real money (M-Pesa, cards) is a separate project: it needs a payment provider and a licensed party to hold funds.
- Clerk, Supabase and the deployed site have not been run end to end by me. Run steps 3 and 7 and send me any error text (not keys).
