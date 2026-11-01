// Builds docs/TEST-RESULTS.md from the reports the test commands leave behind.
// Run after: npm run test:unit && npm run test:e2e && npm run lint:report
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const read = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null);
const unit = read("reports/unit.json");
const e2e = read("test-results/e2e-results.json");
const cov = read("coverage/coverage-summary.json");
const lint = read("reports/lint.json");
const out = [];
const pct = (m) => (m ? `${m.pct}%` : "n/a");

out.push("# Test results", "", `Generated ${new Date().toISOString().slice(0, 10)} by \`npm run evidence\`. Numbers come from the report files of the last run, not from memory.`, "");

out.push("## Summary", "");
if (unit) out.push(`- Unit and integration tests: **${unit.numPassedTests} passed**, ${unit.numFailedTests} failed, ${unit.numPendingTests} skipped (${unit.numTotalTests} total, ${unit.numTotalTestSuites} files).`);
else out.push("- Unit and integration tests: no report found (run `npm run test:unit`).");
if (e2e) {
  const s = e2e.stats ?? {};
  out.push(`- End-to-end tests (Playwright, includes accessibility scans): **${s.expected} passed**, ${s.unexpected} failed, ${s.flaky} flaky, ${s.skipped} skipped.`);
} else out.push("- End-to-end tests: no report found (run `npm run test:e2e`).");
if (lint) {
  const errors = lint.reduce((n, f) => n + f.errorCount, 0);
  const cx = lint.flatMap((f) => f.messages.filter((m) => m.ruleId === "complexity").map((m) => ({ file: f.filePath.replace(process.cwd() + "/", ""), line: m.line, msg: m.message })));
  out.push(`- Lint: ${errors} errors, ${cx.length} functions above the complexity limit of 10.`);
  if (cx.length) {
    out.push("", "## Functions above cyclomatic complexity 10", "", "Reported as warnings, as the Product Quality Plan asks that they are flagged for review.", "", "| File | Line | Finding |", "|---|---|---|");
    for (const c of cx) out.push(`| ${c.file} | ${c.line} | ${c.msg} |`);
  }
}

if (cov) {
  out.push("", "## Coverage", "", "| Scope | Statements | Branches | Functions | Lines |", "|---|---|---|---|---|");
  const row = (name, m) => out.push(`| ${name} | ${pct(m.statements)} | ${pct(m.branches)} | ${pct(m.functions)} | ${pct(m.lines)} |`);
  row("**All measured code**", cov.total);
  for (const [f, m] of Object.entries(cov)) if (f !== "total") row(f.replace(/^.*?\/(src\/)/, "$1"), m);
  out.push("", "Targets (Product Quality Plan): 80% overall; 95% for the ledger, state machine and audit log. The build fails if a threshold is missed (see `vitest.config.mts`).");
}

if (unit) {
  const perf = unit.testResults.flatMap((f) => f.assertionResults).filter((a) => /NFR-3/.test(a.title));
  if (perf.length) {
    out.push("", "## Performance checks", "", "| Test | Result | Time |", "|---|---|---|");
    for (const a of perf) out.push(`| ${a.title} | ${a.status} | ${Math.round(a.duration)} ms |`);
  }
}
if (e2e) {
  const rows = [];
  const walk = (suite, file) => {
    for (const sp of suite.specs ?? []) rows.push([sp.title, sp.tests[0]?.results[0]?.status ?? "?", sp.tests[0]?.results[0]?.duration ?? 0, file]);
    for (const s of suite.suites ?? []) walk(s, suite.file ?? file);
  };
  for (const s of e2e.suites) walk(s, s.file);
  out.push("", "## End-to-end tests", "", "| Test | Result | Time |", "|---|---|---|");
  for (const [t, st, d] of rows) out.push(`| ${t} | ${st} | ${(d / 1000).toFixed(1)} s |`);
}

out.push("", "## What these results do not show", "",
  "- Clerk sign-up, sign-in, MFA and session settings are not exercised: the tests run in demo mode without Clerk keys.",
  "- No load test (200 concurrent users) has been run; only single-operation timings are measured.",
  "- The security scans (dependency audit, CodeQL, OWASP ZAP baseline, secret scan) run in GitHub Actions; their reports are attached to each run as artifacts, not copied here.",
  "- The Postgres integration suite starts an embedded database and must run as a non-root user (it does so in CI).",
  "- Requirements without an automated test are listed with the reason in `docs/TRACEABILITY.md`.", "");
writeFileSync("docs/TEST-RESULTS.md", out.join("\n"));
console.log("wrote docs/TEST-RESULTS.md");
