import { expect, type Browser, type Page } from "@playwright/test";

export type Who = "amina" | "brian" | "sheila" | "kevin" | "grace" | "daniel" | "faith";

/** Signs in as a seeded demo user in a fresh browser context, so several people can act at once. */
export async function login(browser: Browser, who: Who): Promise<Page> {
  const ctx = await browser.newContext({ baseURL: "http://localhost:3200", viewport: { width: 1280, height: 900 } });
  // Pin the region so amounts always show as KSh, whatever the machine running the tests is set to.
  await ctx.addCookies([{ name: "tl_region", value: "KE", url: "http://localhost:3200" }]);
  const page = await ctx.newPage();
  await page.goto("/demo");
  await page.locator(`form:has(input[value="demo_${who}"]) button`).click();
  await page.waitForURL(/\/(dashboard|admin|audit)/);
  return page;
}

export const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function fillIfVisible(page: Page, selector: string, value: string) {
  const el = page.locator(selector).first();
  if (await el.isVisible()) await el.fill(value);
}

/** Drives the four-step "Create contract" wizard as a client. Returns the new contract page URL. */
export async function createContract(page: Page, o: { title: string; freelancerEmail: string; total: string; description?: string }): Promise<string> {
  await page.goto("/contracts/new");
  for (let step = 0; step < 4; step++) {
    await fillIfVisible(page, "#title", o.title);
    await fillIfVisible(page, "#description", o.description ?? "Work agreed in the brief.");
    await fillIfVisible(page, "#freelancerEmail", o.freelancerEmail);
    await fillIfVisible(page, "#mt-1", "Everything");
    await fillIfVisible(page, "#md-1", daysFromNow(20));
    await fillIfVisible(page, "#ma-1", o.total);
    const agree = page.locator('input[type="checkbox"]').first();
    if (await agree.isVisible()) await agree.check();
    const send = page.getByRole("button", { name: "Send proposal" });
    if (await send.isVisible()) {
      await send.click();
      break;
    }
    await page.getByRole("button", { name: /^Continue to/ }).click();
  }
  await expect(page.locator(".notice.ok")).toContainText("Proposal sent");
  return page.url();
}

/** Opens the confirmation dialog behind a button and presses its confirm button. */
export async function confirmDialog(page: Page, trigger: string | RegExp) {
  await page.getByRole("button", { name: trigger }).first().click();
  await page.locator("dialog[open] button[type=submit]").click();
}
