import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("wallet history exports to CSV and contains only the signed-in user's rows [FR-2.8, FR-3.10]", async ({ browser }) => {
  const amina = await login(browser, "amina");
  const res = await amina.request.get("/wallet/export");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  expect(res.headers()["content-disposition"]).toContain("attachment");
  const body = await res.text();
  expect(body.split("\n")[0]).toBe("Date (UTC),Description,Direction,Amount (KSh)");
  expect(body).toContain("Top-up");

  const sheila = await login(browser, "sheila");
  const theirs = await (await sheila.request.get("/wallet/export")).text();
  expect(theirs).not.toContain("Top-up");
  expect(theirs).not.toContain("Escrow funded");
});

test("the signed-out visitor cannot download the CSV [FR-1.12]", async ({ request }) => {
  const res = await request.get("/wallet/export", { maxRedirects: 0 });
  expect([302, 307, 308]).toContain(res.status());
});

test("the client dashboard shows balances, active, disputed and completed contracts [FR-10.1, NFR-5.2]", async ({ browser }) => {
  const amina = await login(browser, "amina");
  await amina.goto("/dashboard");
  await expect(amina.getByText("Available").first()).toBeVisible();
  await expect(amina.getByText("Held in escrow").first()).toBeVisible();
  for (const chip of ["All", "Active", "Disputed", "Completed"]) {
    await expect(amina.getByRole("link", { name: new RegExp(`^${chip}`) }).first()).toBeVisible();
  }
  await amina.getByRole("link", { name: /^Completed/ }).first().click();
  await expect(amina.getByText("Logo animation")).toBeVisible();
  // Other tests share this server and may settle more contracts, so check the filter against a settled one rather than a count.
  await amina.getByRole("link", { name: /^Active/ }).first().click();
  await expect(amina.getByText("Logo animation")).toHaveCount(0);
});
