import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("people get notified about contract events, can mark them read, and the mail catcher shows simulated email [FR-7.1, FR-7.2, FR-7.5]", async ({ browser }) => {
  const sheila = await login(browser, "sheila");
  await sheila.goto("/notifications");
  await expect(sheila.getByRole("heading", { name: "Notifications" })).toBeVisible();
  const first = sheila.locator(".note-item").first();
  await expect(first).toBeVisible();
  await expect(first).toContainText(/New contract proposal|Escrow funded|Work delivered|Proposal|Payment|Dispute/);

  const unread = sheila.getByRole("button", { name: /^Mark all \d+ as read/ });
  if (await unread.count()) {
    await expect(sheila.getByLabel(/\d+ unread/)).toBeVisible();
    await unread.click();
    await expect(sheila.getByRole("button", { name: /Mark all/ })).toHaveCount(0);
    await expect(sheila.getByLabel(/\d+ unread/)).toHaveCount(0);
  }

  const kevin = await login(browser, "kevin");
  await kevin.goto("/admin/mail");
  await expect(kevin.getByRole("heading", { name: "Mail catcher" })).toHaveCount(0);

  const daniel = await login(browser, "daniel");
  await daniel.goto("/admin/mail");
  await expect(daniel.getByRole("heading", { name: "Mail catcher" })).toBeVisible();
  await expect(daniel.locator(".card").first()).toContainText("[TrustLock]");
  await expect(daniel.getByText(/password|token/i)).toHaveCount(1); // only the sentence that says bodies never contain them
});
