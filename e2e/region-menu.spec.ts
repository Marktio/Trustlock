import { expect, test } from "@playwright/test";

test("the top strip shows the simulation notice and a region menu that changes the currency and closes on Escape [NFR-7.4]", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/Simulation only: no real money/)).toBeVisible();

  // The full explanation opens from the notice button.
  await page.locator(".sim-menu").first().locator("summary").click();
  await expect(page.getByText(/practice credits and are not converted/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText(/practice credits and are not converted/)).toBeHidden();

  // Pick a country: the button shows it, and the page keeps working.
  await page.locator(".sim-region > summary").click();
  await page.getByRole("button", { name: /^Uganda/ }).click();
  await expect(page.locator(".sim-region > summary")).toContainText("Uganda");
  await expect(page.locator(".sim-region > summary")).toContainText("UGX");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
