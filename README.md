# TrustLock: Secure Escrow Payment Simulator

TrustLock · A practice escrow for client/freelancer work.
**No real money is used.** Amounts are shown in KSh but are practice credits, stored as integer minor units (100 per KSh).

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

With no keys set, TrustLock runs in **demo mode**: open `/demo` and pick a seeded user
(Amina client; Brian, Sheila, Kevin freelancers; Grace arbitrator; Daniel admin; Faith auditor).
To go live with real accounts, follow `docs/GO-LIVE.md`.

Without Supabase keys, data is **in memory and resets when the server restarts**. With them, see `docs/SETUP.md`.

To use real login, copy `.env.example` to `.env.local` and set the Clerk keys. Roles live in
Clerk `publicMetadata.role`; only client and freelancer can be chosen at `/onboarding`.

## Checks

```bash
npm run lint && npm run typecheck && npm test && npm run build
```
CI (`.github/workflows/ci.yml`) runs the same four steps on every push and pull request.

## How it is built

| Layer | Where |
|---|---|
| Domain rules (state machine, money, double-entry ledger, hash-chained audit log, idempotency) | `src/domain` |
| Storage behind a repository interface; atomic `commit()` | `src/server/memory-repository.ts`, `supabase/migrations/0001_init.sql` |
| Server actions and role checks (UI is never authoritative) | `src/app/actions.ts`, `src/server/auth.ts` |
| Screens | `src/app`, `src/components` |

Security properties implemented and covered by tests: server-side role and state checks, non-parties get 404
(no ID probing), optimistic versioning, idempotent fund/release, ledger reconciliation, audit chain verification,
security headers in `next.config.ts`.

## Status (honest)

Verified: 56 unit tests plus 8 tests that run the real migration and the Supabase adapter on a throwaway PostgreSQL (these skip when run as root; CI runs them), type-check, lint, production build, and a scripted browser walkthrough
(create, accept, fund, deliver, approve, 404 for non-parties, audit verify, 375px layout).

**Also done since:** disputes (raise, withdraw, arbitrator queue and ruling with release, refund or split), per-contract messages,
a dedicated review screen, a 4-step create wizard with a draft kept in the browser, a wallet with filters, CSV export and a top-up dialog,
and a per-contract audit trail page that timeline entries link to. Unit tests cover messages, disputes and all three rulings.

**Not done yet:**
- Supabase adapter is written and tested against real PostgreSQL through a stand-in for the HTTP layer (PostgREST). It has **not** been run against a real Supabase project yet.
- Clerk paths (sign-in, onboarding, `proxy.ts`) are written but untested without keys.
- Admin dashboard, counter-proposals (so the terms version on a contract stays 1), email/push notifications (the Notifications page lists what is waiting on you), mutual cancel after funding.
- The create-contract draft lives in the browser, not the database, so it does not follow you to another device.
- File upload stores name, size and SHA-256 only (no Supabase Storage), so "Download file" is disabled.
- Dark mode.

## Negotiation, evidence and administration

- **Counter-proposals (FR-3.3, FR-3.4).** While a contract is Proposed, the freelancer can change the price, milestones, review period and revision limit instead of accepting. That creates a new terms version and the client must accept or decline it. Terms cannot change after funding. Needs migration `supabase/migrations/0002_counter_proposals.sql`.
- **Dispute evidence (FR-6.3, FR-6.5).** Each side can add text and up to 5 files (name, size, SHA-256) during the evidence window (default 5 days). Entries live in the hash-chained audit log, so they cannot be edited or removed. The assigned arbitrator can ask either side a question, which reopens the window for that side.
- **Assigned arbitrators only (FR-3.10, FR-6.4).** Arbitrators see and rule only on disputes an administrator assigned to them (manual or "fewest open cases").
- **Admin dashboard `/admin` (FR-9).** Users by role, contracts by state, held funds, open disputes, rejected actions in 24 hours, ledger and chain health. Search, suspend and reactivate users (suspended users cannot sign in or act, and their live contracts are frozen and flagged). Create arbitrator and auditor accounts (Clerk mode sends an invitation that carries the role). Edit platform settings: fee, review period, revision limit, proposal and funding windows, evidence window, arbitrator decision time, top-up limits. Every change is audited with old and new values.

Suspensions, settings, whose turn it is on a proposal and dispute assignments are all read from the audit log, so they are tamper-evident and need no extra tables.

Not done yet: real Clerk invitations and MFA enforcement are untested without Clerk keys; failed-login counts come from Clerk, not this app.

## Quality evidence

| Command | What it does |
|---|---|
| `npm run test:unit` | Unit and integration tests with the coverage gate (80% overall, 95% for ledger, state machine and audit). Writes `coverage/` and `reports/unit.json`. |
| `npm run test:e2e` | Builds the app, starts it in demo mode and runs the Playwright journeys, security checks and axe accessibility scans. |
| `npm run lint:report` | Lint as JSON, including the cyclomatic complexity warnings (limit 10). |
| `npm run trace` / `trace:strict` | Rebuilds `docs/TRACEABILITY.md` from the requirement IDs in test titles. Strict mode fails if a Must has no test and no explanation (notes live in `docs/trace-notes.json`). |
| `npm run evidence` | Builds `docs/TEST-RESULTS.md` from the last reports. |
| `npm run audit:deps` | Dependency vulnerability audit (high and critical fail). |

The Postgres integration suite starts an embedded database and refuses to run as root; run it as a normal user (CI does).

GitHub Actions: `ci.yml` (lint, types, tests with coverage gate, traceability, build, e2e, evidence file) and `security.yml` (npm audit, gitleaks, CodeQL, OWASP ZAP baseline). Reports are kept as artifacts for each run, so one set exists per sprint. The security workflow has not been run from here; it runs when the repo is pushed to GitHub.

## Operations

- `GET /api/health` is public and returns the status of the API, the database and the scheduler (200 when healthy, 503 when degraded). It contains no user data.
- `POST /api/cron/scheduler` (or GET) runs the timed jobs: auto-approval after the review period and expiry of old proposals and unfunded contracts. It needs `Authorization: Bearer $CRON_SECRET` and stays off (503) until `CRON_SECRET` is set to at least 16 characters. Point a cron service at it every few minutes (Vercel Cron, GitHub Actions schedule or cron-job.org).
- Withdrawing a dispute and cancelling a funded contract both need the agreement of both parties. The first request is recorded and shown to the other side, who can agree (or, for a cancel, keep the contract).

## Developer API

`/api/v1` lets another app run escrow for its own users, server to server, with an API key. Users are linked by the app's own id, and every call runs with exactly the powers that user has in TrustLock. Same state machine, ledger and audit log as the web app. See `docs/INTEGRATION.md` (typed client in `sdk/trustlock.ts`, copy-paste examples, runnable `examples/marketplace.ts`), `docs/API.md` (reference) or `GET /api/v1/openapi.json`. Also: signed **webhooks** (Upstash QStash delivery with retries), a self-serve **`/developers`** page (keys, webhooks, call log), **test and live** keys with separate data, dispute evidence, and single-file **Python** (`sdk/python/trustlock.py`) and **PHP** (`sdk/php/TrustLock.php`) clients. Keys: the `/developers` page, or `npm run api:key -- --label "Name" --mode test` (needs migrations `0003` and `0004`, applied by `npm run wire:db`).

## Notifications

In-app notifications and simulated emails are derived from the audit log, so they always match what really happened. Messages use fixed templates with the contract title and a person's name only; text that users type is never copied in. Marking notifications as read is recorded in the audit log. Administrators can see the simulated outbox at `/admin/mail`; nothing is ever delivered to a real mailbox.

## Security hardening

- Every response carries a Content Security Policy, HSTS, `X-Frame-Options: DENY`, `nosniff`, a referrer policy and a permissions policy (`next.config.ts`). Scripts still allow `'unsafe-inline'` because Next.js bootstraps with inline scripts; moving to nonces is the next step.
- Rate limiting runs in `src/proxy.ts`: 100 requests a minute per signed-in user (or per address when signed out) and 10 a minute on sign-in and sign-up pages, answered with `429` and `Retry-After`. Prefetches and the health check are not counted. Counts are shared across instances through Upstash Redis when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set, and kept in memory per instance otherwise. Limits can be changed with `RATE_LIMIT_PER_MINUTE` and `AUTH_RATE_LIMIT_PER_MINUTE`.

## Wiring Clerk and Supabase

`WIRE_DB.bat` (Windows) or `npm run wire:db` checks your Clerk and Supabase keys, applies any missing SQL (0001, then 0002), adds missing Clerk redirect settings to `.env.local`, and runs a smoke test. It never drops or overwrites data and is safe to run twice. `npm run wire:db:check` only looks. Put `SUPABASE_ACCESS_TOKEN=sbp_...` in `.env.local` if you want it to apply the SQL itself. It has not yet been run against live accounts. See `docs/SETUP.md`.

## "How it works" popup and the first administrator

The landing page has a "How it works" button that opens a popup with a text walk-through (default) and a 48-second video that never autoplays (`public/how-it-works/`, 3 MB, with captions). Its amounts are practice credits (SC); inside the app they appear in the viewer's currency. In Clerk mode, give the first administrator their role with `node --env-file=.env.local scripts/set-role.mjs you@example.com admin` (see `docs/SETUP.md`).
