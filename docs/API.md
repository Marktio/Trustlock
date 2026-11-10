# TrustLock developer API (v1)

Escrow for **your own users**. Your server calls TrustLock with an API key and says which of your users each call is for. TrustLock never sees your users' passwords or emails; it holds an id and a display name for each. Practice credits only: no real money moves.

**Writing code?** Start with `docs/INTEGRATION.md` (client library, copy-paste examples). Machine-readable description: `GET /api/v1/openapi.json` (no key needed).

## How your users are linked

1. You register a user once: `POST /api/v1/users` with *your* id for them (`external_id`), a name and a role (`client` or `freelancer`).
2. On every later call you send `TrustLock-User: <external_id>`. The call then runs **as that user**, with exactly the powers they have in the TrustLock app: a freelancer cannot fund, a client cannot accept their own proposal, a stranger gets 404.
3. Behind the scenes the user is a normal TrustLock account with id `x_<platform>_<external_id>`. Every action lands in the same hash-chained audit log, and the same state machine and double-entry ledger decide what is allowed.

Platforms are walled off from each other and from the web app: a contract is visible through the API only when **both** people on it belong to your platform. Arbitration is done by TrustLock staff in the TrustLock app; your users can raise a dispute and send messages through the API, and the ruling shows up as the contract's `state`.

## Getting a key

| Where | How |
|---|---|
| The `/developers` page | Sign in, open **Developers**, name the key and choose **Test** or **Live**. The key is shown once; only its SHA-256 hash is stored. Up to 5 active keys per person; you can revoke any of them. |
| Command line (Supabase) | Apply migrations `0003` and `0004` (`npm run wire:db` does it), then `npm run api:key -- --label "Acme Marketplace" --mode test`. Add `--platform <id>` to make another key for the same platform. |
| Local demo mode | Set `TRUSTLOCK_DEV_API_KEY=tlk_<any long random text>` in `.env.local`. Ignored in production. |

Send it as `Authorization: Bearer tlk_...`. Keep it on your server. Never put it in a browser or mobile app.

### Test and live keys

Keys look like `tlk_test_...` or `tlk_live_...`. The two modes are **separate worlds**: users, wallets, contracts and webhook endpoints made with a test key are invisible to the live key of the same platform, and the other way round. Try everything with a test key; nothing you do there touches live data. Every response carries a `TrustLock-Mode: test|live` header.

## Conventions

- **Amounts** are integers in minor units: `100` = 1 credit (shown as KSh in the app). `150000` = 1,500.00.
- **Errors** always look like `{ "error": { "code": "...", "message": "..." } }`.
- **Idempotency**: send an `Idempotency-Key` header (8 to 100 chars) on `fund`, `approve`, top-ups and withdrawals (required) and on contract creation (recommended). Repeating a request with the same key changes nothing and returns the first result, so retrying after a timeout is safe.
- **Limits**: 120 requests a minute per key (429 with `Retry-After`), 300 a minute per address before the key is checked. Counts are shared across all server instances when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set (per instance otherwise).

| HTTP | `error.code` examples |
|---|---|
| 400 | `MISSING_USER`, `INVALID_JSON`, `IDEMPOTENCY_KEY_REQUIRED` |
| 401 | `MISSING_API_KEY`, `INVALID_API_KEY` |
| 402 | `INSUFFICIENT_FUNDS` |
| 403 | `FORBIDDEN`, `USER_SUSPENDED` |
| 404 | `NOT_FOUND`, `USER_NOT_FOUND`, `UNKNOWN_ACTION` |
| 409 | `ILLEGAL_TRANSITION`, `CONFLICT`, `ROLE_IMMUTABLE` |
| 422 | `VALIDATION`, `LIMIT` |
| 429 | `RATE_LIMITED` |

## Endpoints

| Method and path | What it does | Header user |
|---|---|---|
| `POST /users` | Register or update a user (`external_id`, `name`, `role`) | no |
| `GET /users/{external_id}` | The user and their balances | no |
| `GET /wallet` | Balances and the last 100 ledger entries | yes |
| `POST /wallet/top-ups` | `{ "amount": n }` add credits (clients) | yes |
| `POST /wallet/withdrawals` | `{ "amount": n }` pay out (freelancers) | yes |
| `GET /contracts?state=` | The user's contracts | yes |
| `POST /contracts` | Propose a contract (client names the `freelancer`) | yes |
| `GET /contracts/{id}` | One contract with `allowed_actions`, `awaiting`, `timeline`, `messages` | yes |
| `POST /contracts/{id}/{action}` | Do something, returns the contract afterwards | yes |
| `POST /webhook-endpoints` | `{ "url": "https://...", "events": ["*"] }` register an endpoint; returns the signing `secret` once | no |
| `GET /webhook-endpoints` | Your endpoints (in this key's mode) | no |
| `GET /webhook-endpoints/{id}` | One endpoint with its 20 latest deliveries (attempts, last status, last error) | no |
| `DELETE /webhook-endpoints/{id}` | Remove it | no |
| `POST /webhook-endpoints/{id}/test` | Send a `ping` now and see how your server answered | no |
| `GET /usage?limit=50` | Your most recent API calls in this mode: method, path, status, `error_code`, milliseconds (kept 30 days) | no |

Actions: `accept`, `reject` (reason), `counter`, `accept-counter`, `decline-counter` (reason), `cancel`, `fund`, `start-work`, `deliver`, `request-revision` (reason), `approve`, `dispute` (reason), `withdraw-dispute`, `cancel-funded`, `decline-cancel`, `message` (text), `evidence` (see below). Ask `GET /contracts/{id}` for `allowed_actions` to know which ones the user can take right now. The names it returns are exactly the action names above.

## Walk-through

```bash
KEY="tlk_..."; B=https://YOUR-HOST/api/v1
H=(-H "Authorization: Bearer $KEY" -H "Content-Type: application/json")

# 1. Link two of your users
curl "${H[@]}" -d '{"external_id":"cust-1001","name":"Amina","role":"client"}' $B/users
curl "${H[@]}" -d '{"external_id":"cust-2002","name":"Brian","role":"freelancer"}' $B/users

# 2. Give the client practice credits
curl "${H[@]}" -H "TrustLock-User: cust-1001" -H "Idempotency-Key: topup-0001" -d '{"amount":500000}' $B/wallet/top-ups

# 3. The client proposes a contract (amount must equal the milestones' total)
curl "${H[@]}" -H "TrustLock-User: cust-1001" -H "Idempotency-Key: create-0001" -d '{
  "freelancer":"cust-2002","title":"Logo and brand sheet","description":"A logo and a one-page brand sheet.",
  "amount":150000,"review_period_days":3,"revision_limit":1,
  "milestones":[{"title":"Concepts","due_date":"2026-12-01","amount":50000},{"title":"Final files","due_date":"2026-12-15","amount":100000}]
}' $B/contracts            # -> { "id": "<contract id>", "state": "proposed", ... }

ID=<contract id>
curl "${H[@]}" -X POST -H "TrustLock-User: cust-2002" $B/contracts/$ID/accept                      # freelancer accepts
curl "${H[@]}" -X POST -H "TrustLock-User: cust-1001" -H "Idempotency-Key: fund-0001" $B/contracts/$ID/fund   # money is now held
curl "${H[@]}" -X POST -H "TrustLock-User: cust-2002" $B/contracts/$ID/start-work
curl "${H[@]}" -H "TrustLock-User: cust-2002" -d '{"file_name":"brand.zip","size_bytes":2048,"sha256":"<hex sha-256 of the file>"}' $B/contracts/$ID/deliver
curl "${H[@]}" -X POST -H "TrustLock-User: cust-1001" -H "Idempotency-Key: approve-0001" $B/contracts/$ID/approve   # released to the freelancer
```

Files are never uploaded: a delivery records the file name, size and SHA-256 fingerprint, the same as the web app.

## Dispute evidence

While a contract is `disputed`, either party can add evidence: `POST /contracts/{id}/evidence` with `{ "text": "...", "files": [{ "file_name": "brief.pdf", "size_bytes": 1234, "sha256": "..." }] }`. As with deliveries, files are recorded by name, size and SHA-256; the file itself stays with you. `GET /contracts/{id}` shows `evidence.can_submit` and `evidence.files_left`, and `evidence` appears in `allowed_actions` when the user can add some. Staff see it in the TrustLock app when they rule.

## Webhooks

Register an endpoint (the `/developers` page or `POST /webhook-endpoints`) and TrustLock sends it a signed `POST` whenever a contract in that key's mode changes, so you do not have to poll. Endpoints must be public `https://` addresses (private and local addresses are refused).

```json
{ "id": "evt_42", "type": "contract.funded", "created_at": "2026-11-09T05:55:00.000Z",
  "data": { "state": "funded", "previous_state": "accepted", "contract": { "id": "...", "ref": "...", "amount": 20000, "...": "..." } } }
```

**Events:** `contract.proposed`, `accepted`, `funded`, `in_progress`, `delivered`, `approved`, `completed`, `disputed`, `refunded`, `resolved_split`, `rejected`, `cancelled`, `expired` (all as `contract.<state>`), plus `contract.message`, `dispute.evidence_submitted` and `ping`. Subscribe to `["*"]` or to a list.

**Verify every delivery.** Headers: `TrustLock-Signature: t=<unix seconds>,v1=<hex>`, `TrustLock-Event-Id`, `TrustLock-Event-Type`. The signature is `HMAC-SHA256(secret, "<t>.<raw body>")`. Use the raw request body, not re-encoded JSON. The clients have a helper: `verifyWebhook` (TypeScript), `verify_webhook` (Python), `Client::verifyWebhook` (PHP).

**Handle repeats.** A delivery can arrive more than once. Deduplicate on the event `id`, and answer with any `2xx` quickly. A retry keeps its original timestamp, so do not reject old ones too eagerly (the helpers allow a day).

**Delivery and retries.** With `QSTASH_TOKEN` set, TrustLock hands each event to Upstash QStash, which calls your endpoint and keeps retrying with back-off for hours. Without it, TrustLock sends directly and retries up to 5 times over about 15 hours, picked up whenever its scheduler next runs (`/api/cron/scheduler`); this fallback is not durable across restarts on its own, so use QStash in production. `GET /webhook-endpoints/{id}` shows what happened to each delivery.

## Not in v1

Arbitration through the API (staff rule in the TrustLock app; the result arrives as the contract's `state` and as a webhook), uploading evidence or deliverable files themselves, and per-event retry controls.
