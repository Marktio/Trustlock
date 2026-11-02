import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("the account menu switches between demo accounts in one click and is accessible when open [NFR-5.3, FR-1.12]", async ({ browser }) => {
  const page = await login(browser, "amina");
  await expect(page).toHaveURL(/\/dashboard/);

  // Open the menu: every demo account is listed, and the current one is marked.
  await page.locator(".switcher > summary").click();
  await expect(page.getByRole("button", { name: /Daniel Kiprop/ })).toBeVisible();
  await expect(page.locator('.switcher-menu button[aria-current="true"]')).toContainText("Amina Wanjiru");

  const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = scan.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${v.id} (${v.nodes[0]?.target})`)).toEqual([]);

  // One click: the administrator lands on the admin panel, with the admin's navigation.
  await page.getByRole("button", { name: /Daniel Kiprop/ }).click();
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByRole("heading", { name: "Admin dashboard" })).toBeVisible();

  // And back: the client lands on the dashboard again.
  await page.locator(".switcher > summary").click();
  await page.getByRole("button", { name: /Amina Wanjiru/ }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("link", { name: "Wallet" }).first()).toBeVisible();

  // Sign out from the same menu returns to the landing page.
  await page.locator(".switcher > summary").click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.context().close();
});
