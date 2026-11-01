# Putting TrustLock on GitHub and running the pipelines

Do this once, at least a day before the evaluation, so the first pipeline run has time to show problems.

## 1. Create the repository and push

1. On GitHub create a new repository named `trustlock` (public is simplest: CodeQL is free on public repositories; on a private one it needs GitHub Advanced Security).
2. Do not add a README or .gitignore there.
3. In the project folder:

```bash
git init -b main
git add .
git status          # check that no .env.local or node_modules is listed
git commit -m "TrustLock: escrow simulator"
git remote add origin https://github.com/<your-user>/trustlock.git
git push -u origin main
```

`.env*` files are ignored by `.gitignore`. Only `.env.example` is committed. Never commit real keys.

## 2. Watch the first run

Open the repository's **Actions** tab. Two workflows start:

| Workflow | Jobs | Expect |
|---|---|---|
| CI | test, e2e, evidence | Green if everything passes. The `evidence` job attaches `TEST-RESULTS.md` as an artifact. |
| Security | dependencies, secrets, codeql, zap | `npm audit` can fail on a high or critical advisory. CodeQL and ZAP findings appear under **Security**. |

A red job is information, not failure: fix it, or write it down honestly in the Quality Plan. Do not delete a scan to make the pipeline green.

## 3. Likely first-run problems

- **`npm audit` fails.** Run `npm audit` locally, then `npm audit fix`. If the fix needs a breaking upgrade, note the advisory in the Quality Plan with the reason it is accepted.
- **gitleaks reports a secret.** Check the finding. If it is a real key, rotate it at the provider, then remove it from history. Test fixtures are not secrets, but add an allow rule instead of ignoring the job.
- **CodeQL job fails on a private repository.** Make the repository public, or turn the job off and say so.
- **The e2e job is slow or flaky.** It rebuilds the app and runs 32 tests in about two minutes. A single retry is allowed in CI.
- **ZAP warns about CSP.** The policy still allows inline scripts because Next.js needs them. That is listed as a known limit.

## 4. Protect the main branch (NFR-6.3)

Settings → Branches → Add rule for `main`: require a pull request, require the **CI / test** and **CI / e2e** checks, and block force pushes. This is what makes "every push triggers the pipeline" true for the whole team.

## 5. Save the evidence

After a green run, open the run page and download the `unit-reports-*`, `e2e-reports-*` and `TEST-RESULTS-*` artifacts. Keep one set per sprint (Product Quality Plan, test recording).

## 6. Secrets for a real deployment

CI needs no secrets. A deployment needs `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` and `CRON_SECRET`, set in the hosting provider's environment settings, never in the repository. See `README.md` and `docs/SETUP.md`.
