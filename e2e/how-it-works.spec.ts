import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("the How it works popup opens on the text tab, steps through, switches to a paused video, and closes with Escape [NFR-5.3]", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "How it works" }).click();
  const dialog = page.getByRole("dialog", { name: "How it works" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "Text" })).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByText("Nobody can spend it, not even Amina.")).toBeVisible();
  await dialog.getByRole("button", { name: "Next" }).click();
  await expect(dialog.getByText(/SHA-256 fingerprint is recorded/)).toBeVisible();

  const results = await new AxeBuilder({ page }).include("dialog").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);

  await dialog.getByRole("tab", { name: /Video/ }).click();
  const video = dialog.locator("video");
  await expect(video).toBeVisible();
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  const src = await video.locator("source").getAttribute("src");
  const res = await page.request.get(src!);
  expect(res.status()).toBe(200);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
