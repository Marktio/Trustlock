import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// This file is named to run last: the sign-in limiter blocks that path for a minute afterwards.

test("every page sends the security headers, and the Content Security Policy does not break the app [NFR-1.9, NFR-1.1]", async ({ browser, request }) => {
  const res = await request.get("/demo");
  const h = res.headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).toContain("object-src 'none'");
  expect(h["strict-transport-security"]).toContain("max-age=");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-powered-by"]).toBeUndefined();

  const page = await login(browser, "amina");
  const violations: string[] = [];
  page.on("console", (m) => /content security policy/i.test(m.text()) && violations.push(m.text()));
  page.on("pageerror", (e) => violations.push(e.message));
  for (const path of ["/dashboard", "/contracts", "/contracts/new", "/wallet", "/notifications", "/profile"]) {
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible();
  }
  expect(violations).toEqual([]);
});

test("too many sign-in requests from one address are answered with 429 and a wait time [NFR-1.6, FR-1.7]", async ({ request }) => {
  const statuses: number[] = [];
  let retryAfter: string | undefined;
  for (let i = 0; i < 14; i++) {
    const r = await request.get("/sign-in", { maxRedirects: 0 });
    statuses.push(r.status());
    if (r.status() === 429) retryAfter = r.headers()["retry-after"];
  }
  expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(3);
  expect(Number(retryAfter)).toBeGreaterThan(0);
  expect(statuses.slice(0, 5).every((s) => s !== 429)).toBe(true);
});
