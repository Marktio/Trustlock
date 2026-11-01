# Test results

Generated 2026-11-01 by `npm run evidence`. Numbers come from the report files of the last run, not from memory.

## Summary

- Unit and integration tests: **136 passed**, 0 failed, 0 skipped (136 total, 48 files).
- End-to-end tests (Playwright, includes accessibility scans): **33 passed**, 0 failed, 0 flaky, 0 skipped.
- Lint: 0 errors, 15 functions above the complexity limit of 10.

## Functions above cyclomatic complexity 10

Reported as warnings, as the Product Quality Plan asks that they are flagged for review.

| File | Line | Finding |
|---|---|---|
| src/app/admin/page.tsx | 23 | Async function 'AdminPage' has a complexity of 14. Maximum allowed is 10. |
| src/app/cases/[id]/page.tsx | 15 | Async function 'CasePage' has a complexity of 13. Maximum allowed is 10. |
| src/app/contracts/[id]/page.tsx | 40 | Async function 'ContractPage' has a complexity of 71. Maximum allowed is 10. |
| src/app/contracts/[id]/review/page.tsx | 17 | Async function 'ReviewPage' has a complexity of 16. Maximum allowed is 10. |
| src/app/dashboard/page.tsx | 12 | Async function 'Dashboard' has a complexity of 27. Maximum allowed is 10. |
| src/app/wallet/page.tsx | 30 | Async function 'WalletPage' has a complexity of 15. Maximum allowed is 10. |
| src/components/new-contract-form.tsx | 25 | Function 'NewContractForm' has a complexity of 11. Maximum allowed is 10. |
| src/components/new-contract-form.tsx | 57 | Arrow function has a complexity of 12. Maximum allowed is 10. |
| src/domain/escrow-service.ts | 217 | Async method 'getContractView' has a complexity of 15. Maximum allowed is 10. |
| src/domain/escrow-service.ts | 563 | Async method 'resolveDispute' has a complexity of 12. Maximum allowed is 10. |
| src/domain/escrow-service.ts | 1010 | Async method 'assignArbitrator' has a complexity of 12. Maximum allowed is 10. |
| src/proxy.ts | 12 | Function 'describe' has a complexity of 11. Maximum allowed is 10. |
| src/server/auth.ts | 17 | Async function 'resolve' has a complexity of 15. Maximum allowed is 10. |
| src/server/memory-repository.ts | 76 | Async method 'commit' has a complexity of 14. Maximum allowed is 10. |
| src/server/supabase-repository.ts | 28 | Function 'buildCommitPayload' has a complexity of 13. Maximum allowed is 10. |

## Coverage

| Scope | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| **All measured code** | 91.38% | 83.77% | 91.17% | 95.32% |
| src/domain/audit.ts | 96.42% | 95.83% | 100% | 96.15% |
| src/domain/derived.ts | 98.48% | 61.36% | 100% | 100% |
| src/domain/errors.ts | 100% | 100% | 100% | 100% |
| src/domain/escrow-service.ts | 92.97% | 85.26% | 94.4% | 97.35% |
| src/domain/gateway.ts | 100% | 100% | 100% | 100% |
| src/domain/ledger.ts | 100% | 100% | 100% | 100% |
| src/domain/money.ts | 82.92% | 82.85% | 87.5% | 84.21% |
| src/domain/notifications.ts | 98.07% | 83.78% | 100% | 100% |
| src/domain/repository.ts | 100% | 100% | 100% | 100% |
| src/domain/schemas.ts | 100% | 83.33% | 100% | 100% |
| src/domain/states.ts | 100% | 100% | 100% | 100% |
| src/domain/types.ts | 100% | 100% | 100% | 100% |
| src/server/memory-repository.ts | 92.22% | 89.23% | 90.24% | 95.58% |
| src/server/ops.ts | 100% | 94.11% | 100% | 100% |
| src/server/rate-limit.ts | 100% | 100% | 100% | 100% |
| src/server/supabase-repository.ts | 64.42% | 70.32% | 64.28% | 75% |

Targets (Product Quality Plan): 80% overall; 95% for the ledger, state machine and audit log. The build fails if a threshold is missed (see `vitest.config.mts`).

## Performance checks

| Test | Result | Time |
|---|---|---|
| verifies a chain of 100,000 audit entries well inside 60 seconds [NFR-3.4] | passed | 675 ms |
| finds a single altered entry at the end of a 100,000-entry chain [NFR-3.4, FR-8.4] | passed | 533 ms |
| a release completes in well under 2 seconds including ledger and audit writes [NFR-3.3] | passed | 10 ms |
| runs the whole happy path and keeps ledger and audit chain intact [FR-8.5, NFR-2.2, FR-2.5, NFR-3.3] | passed | 140 ms |

## End-to-end tests

| Test | Result | Time |
|---|---|---|
| / as a visitor has no serious or critical accessibility violations [NFR-5.3] | passed | 1.5 s |
| /demo as a visitor has no serious or critical accessibility violations [NFR-5.3] | passed | 1.0 s |
| /dashboard as amina has no serious or critical accessibility violations [NFR-5.3] | passed | 1.6 s |
| /contracts as amina has no serious or critical accessibility violations [NFR-5.3] | passed | 1.7 s |
| /contracts/new as amina has no serious or critical accessibility violations [NFR-5.3] | passed | 1.6 s |
| /wallet as amina has no serious or critical accessibility violations [NFR-5.3] | passed | 1.8 s |
| /notifications as amina has no serious or critical accessibility violations [NFR-5.3] | passed | 1.7 s |
| /profile as amina has no serious or critical accessibility violations [NFR-5.3] | passed | 1.6 s |
| /admin as daniel has no serious or critical accessibility violations [NFR-5.3] | passed | 1.9 s |
| /admin/mail as daniel has no serious or critical accessibility violations [NFR-5.3] | passed | 1.7 s |
| /notifications as grace has no serious or critical accessibility violations [NFR-5.3] | passed | 1.5 s |
| /audit as faith has no serious or critical accessibility violations [NFR-5.3] | passed | 1.8 s |
| /dashboard as grace has no serious or critical accessibility violations [NFR-5.3] | passed | 1.4 s |
| a freelancer counter-proposes and the client accepts the new terms [FR-3.3, FR-3.4] | passed | 2.3 s |
| a dispute goes through evidence, assignment, a question and a ruling that moves the money [FR-6.1 to FR-6.7, FR-9.5, FR-3.10] | passed | 5.7 s |
| an administrator can suspend a user, who is then locked out until reactivated [FR-9.2, FR-9.6] | passed | 1.9 s |
| settings changes are saved, applied and written to the audit log [FR-9.4, FR-8.7] | passed | 1.0 s |
| a client creates, funds and approves a contract and the freelancer is paid [FR-3.1, FR-3.9, FR-4.1, FR-5.1, FR-5.2, FR-5.3, FR-5.8, FR-2.1, NFR-5.2, NFR-5.4, NFR-7.4] | passed | 5.2 s |
| the auditor can verify the audit chain and the ledger balances after the journey [FR-8.4, FR-9.7, NFR-2.3] | passed | 0.7 s |
| the How it works popup opens on the text tab, steps through, switches to a paused video, and closes with Escape [NFR-5.3] | passed | 1.9 s |
| people get notified about contract events, can mark them read, and the mail catcher shows simulated email [FR-7.1, FR-7.2, FR-7.5] | passed | 2.2 s |
| wallet history exports to CSV and contains only the signed-in user's rows [FR-2.8, FR-3.10] | passed | 1.2 s |
| the signed-out visitor cannot download the CSV [FR-1.12] | passed | 0.0 s |
| the client dashboard shows balances, active, disputed and completed contracts [FR-10.1, NFR-5.2] | passed | 1.1 s |
| a user who is not a party cannot open a contract, and gets the same page as for a contract that does not exist [FR-3.10, NFR-1.5] | passed | 1.8 s |
| pages are limited by role on the server [FR-1.12, FR-9.1, FR-8.4] | passed | 3.2 s |
| signed-out visitors are sent to sign in [FR-1.12] | passed | 0.7 s |
| free text is shown as text and never run as HTML [FR-3.12, NFR-1.4] | passed | 1.9 s |
| a repeated form post cannot fund twice, and a stale page cannot act after the state changed [FR-2.7, FR-4.5, FR-3.6] | passed | 4.7 s |
| the simulation notice is on every page [NFR-7.4] | passed | 1.2 s |
| health check is public and the scheduler endpoint is closed without its secret [NFR-4.4, FR-5.7] | passed | 0.1 s |
| every page sends the security headers, and the Content Security Policy does not break the app [NFR-1.9, NFR-1.1] | passed | 1.7 s |
| too many sign-in requests from one address are answered with 429 and a wait time [NFR-1.6, FR-1.7] | passed | 0.3 s |

## What these results do not show

- Clerk sign-up, sign-in, MFA and session settings are not exercised: the tests run in demo mode without Clerk keys.
- No load test (200 concurrent users) has been run; only single-operation timings are measured.
- The security scans (dependency audit, CodeQL, OWASP ZAP baseline, secret scan) run in GitHub Actions; their reports are attached to each run as artifacts, not copied here.
- The Postgres integration suite starts an embedded database and must run as a non-root user (it does so in CI).
- Requirements without an automated test are listed with the reason in `docs/TRACEABILITY.md`.
