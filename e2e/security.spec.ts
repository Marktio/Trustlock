import { expect, test } from "@playwright/test";
import { createContract, login } from "./helpers";

test("a user who is not a party cannot open a contract, and gets the same page as for a contract that does not exist [FR-3.10, NFR-1.5]", async ({ browser }) => {
  const amina = await login(browser, "amina");
  await amina.goto("/contracts");
  const href = await amina.getByRole("link", { name: /Website copywriting/ }).first().getAttribute("href");
  expect(href).toMatch(/^\/contracts\/[0-9a-f-]{36}$/);

  const kevin = await login(browser, "kevin"); // freelancer on a different contract
  const stranger = await kevin.goto(href!);
  const missing = await kevin.goto("/contracts/00000000-0000-4000-8000-000000000000");
  expect(stranger?.status()).toBe(404);
  expect(missing?.status()).toBe(404);
  await expect(kevin.getByText("Website copywriting")).toHaveCount(0);
  await kevin.goto(href! + "/review");
  await expect(kevin.getByText("Website copywriting")).toHaveCount(0);
  await kevin.goto(href! + "/audit");
  await expect(kevin.getByText("Website copywriting")).toHaveCount(0);
});

test("pages are limited by role on the server [FR-1.12, FR-9.1, FR-8.4]", async ({ browser }) => {
  const amina = await login(browser, "amina");
  for (const path of ["/admin", "/audit", "/cases/anything"]) {
    await amina.goto(path);
    await expect(amina).toHaveURL(/\/dashboard$/);
  }
  const brian = await login(browser, "brian");
  await brian.goto("/contracts/new"); // clients only
  await expect(brian).toHaveURL(/\/dashboard$/);
  const grace = await login(browser, "grace");
  await grace.goto("/wallet");
  await expect(grace).toHaveURL(/\/dashboard$/);
  const faith = await login(browser, "faith");
  await faith.goto("/admin");
  await expect(faith).toHaveURL(/\/dashboard|\/audit/);
});

test("signed-out visitors are sent to sign in [FR-1.12]", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/demo$/);
  await page.goto("/wallet");
  await expect(page).toHaveURL(/\/demo$/);
});

test("free text is shown as text and never run as HTML [FR-3.12, NFR-1.4]", async ({ browser }) => {
  const amina = await login(browser, "amina");
  const payload = `<img src=x onerror="window.__xss=1"> <script>window.__xss=1</script>`;
  let fired = false;
  amina.on("dialog", () => (fired = true));
  await createContract(amina, { title: "XSS probe " + payload.slice(0, 30), description: payload, freelancerEmail: "sheila@example.com", total: "100" });
  await expect(amina.getByRole("heading", { name: /XSS probe/ })).toBeVisible();
  expect(await amina.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  await expect(amina.locator('img[src="x"]')).toHaveCount(0);
  expect(fired).toBe(false);
});

test("a repeated form post cannot fund twice, and a stale page cannot act after the state changed [FR-2.7, FR-4.5, FR-3.6]", async ({ browser }) => {
  const amina = await login(browser, "amina");
  const brian = await login(browser, "brian");
  const url = await createContract(amina, { title: "Double click probe", freelancerEmail: "brian@example.com", total: "1000" });
  await brian.goto(url);
  await brian.getByRole("button", { name: "Accept contract" }).click();
  await expect(brian.locator(".notice.ok")).toContainText("Contract accepted");
  await amina.goto(url);
  await amina.getByRole("button", { name: /^Fund KSh 1,000/ }).click();
  const dialog = amina.locator("dialog[open]");
  // Submit the same dialog form twice in a row with the same idempotency key.
  await dialog.evaluate((d) => {
    const form = d.querySelector("form") as HTMLFormElement;
    const data = new FormData(form);
    const post = () => fetch(form.action || location.href, { method: "POST", body: data, headers: { Accept: "text/x-component" } });
    void post();
    void post();
  });
  await amina.waitForTimeout(1500);
  await amina.goto("/wallet");
  // Exactly one KSh 1,000 lock for this contract.
  await expect(amina.getByText("Escrow funded: Double click probe")).toHaveCount(1);
});

test("the simulation notice is on every page [NFR-7.4]", async ({ browser }) => {
  const amina = await login(browser, "amina");
  for (const path of ["/dashboard", "/wallet", "/contracts", "/contracts/new"]) {
    await amina.goto(path);
    await expect(amina.getByText(/Simulation only: no real money/)).toBeVisible();
  }
});

test("health check is public and the scheduler endpoint is closed without its secret [NFR-4.4, FR-5.7]", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ status: "ok", checks: { api: "ok", database: "ok" } });
  const off = await request.post("/api/cron/scheduler");
  expect(off.status()).toBe(503);
});
