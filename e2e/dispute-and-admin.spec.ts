import { expect, test } from "@playwright/test";
import { confirmDialog, login } from "./helpers";

test.describe.configure({ mode: "serial" });

test("a freelancer counter-proposes and the client accepts the new terms [FR-3.3, FR-3.4]", async ({ browser }) => {
  const kevin = await login(browser, "kevin");
  const amina = await login(browser, "amina");
  await kevin.goto("/contracts");
  await kevin.getByRole("link", { name: /Product photos/ }).first().click();
  await kevin.waitForURL(/\/contracts\/[0-9a-f-]{36}/);
  await kevin.locator("summary", { hasText: "Counter-propose" }).click();
  await kevin.fill("#ct-total", "15000");
  await kevin.fill("#ct-a-1", "15000");
  await kevin.fill("#ct-note", "Retouching needs more budget.");
  await kevin.getByRole("button", { name: "Send counter-proposal" }).click();
  await expect(kevin.getByText(/Waiting for Amina.*answer your counter-proposal/)).toBeVisible();
  await expect(kevin.getByRole("button", { name: "Accept contract" })).toHaveCount(0);

  await amina.goto(kevin.url());
  await expect(amina.getByText(/proposed new terms \(version 2\)/)).toBeVisible();
  await expect(amina.locator(".notice.warn").first()).toContainText(/12,000.*15,000/);
  await amina.getByRole("button", { name: "Accept new terms" }).click();
  await expect(amina.getByRole("button", { name: /^Fund KSh 15,000/ })).toBeVisible();
});

test("a dispute goes through evidence, assignment, a question and a ruling that moves the money [FR-6.1 to FR-6.7, FR-9.5, FR-3.10]", async ({ browser }) => {
  const amina = await login(browser, "amina");
  const sheila = await login(browser, "sheila");
  const daniel = await login(browser, "daniel");
  const grace = await login(browser, "grace");

  await amina.goto("/contracts");
  await amina.getByRole("link", { name: /Website copywriting/ }).first().click();
  await amina.waitForURL(/\/contracts\/[0-9a-f-]{36}/);
  const url = amina.url();
  await confirmDialogWithReason(amina, "Raise dispute", "#dispute-reason", "Tone does not match the brand guide.");
  await expect(amina.getByText("Waiting for an administrator to assign an arbitrator")).toBeVisible();

  // Withdrawing needs both sides: one request changes nothing, and the other side is offered the choice to agree (FR-6.8).
  await confirmDialog(amina, "Ask to withdraw dispute");
  await expect(amina.locator(".notice.ok")).toContainText("request to withdraw is recorded");
  await expect(amina.getByText("You asked to withdraw this dispute")).toBeVisible();
  await sheila.goto(url);
  await expect(sheila.getByRole("button", { name: "Agree to withdraw dispute" })).toBeVisible();

  // Nobody is assigned yet, so the arbitrator sees nothing.
  await grace.goto("/dashboard");
  await expect(grace.getByText("Website copywriting")).toHaveCount(0);

  // Both sides add evidence. Files are recorded by fingerprint.
  await amina.fill("#ev-text", "The guide asks for a warm tone.");
  await amina.setInputFiles("#ev-files", { name: "brand-guide.pdf", mimeType: "application/pdf", buffer: Buffer.from("guide") });
  await expect(amina.getByText(/brand-guide\.pdf/)).toBeVisible();
  await amina.getByRole("button", { name: "Submit evidence" }).click();
  await expect(amina.locator(".notice.ok")).toContainText("Evidence submitted");
  await sheila.goto(url);
  await sheila.fill("#ev-text", "Tone was agreed on the kickoff call.");
  await sheila.getByRole("button", { name: "Submit evidence" }).click();
  await expect(sheila.getByText("brand-guide.pdf")).toBeVisible();

  // The administrator assigns Grace, who can now see the case and both sides' evidence.
  await daniel.goto("/admin");
  const row = daniel.locator("tr", { hasText: "Website copywriting" });
  await expect(row.getByText("Unassigned")).toBeVisible();
  await row.getByRole("button", { name: "Assign" }).click();
  await expect(daniel.locator(".notice.ok")).toContainText("is now assigned to the case");
  await grace.goto("/dashboard");
  await grace.getByRole("link", { name: /Open case/ }).first().click();
  await expect(grace.getByText("brand-guide.pdf")).toBeVisible();
  await expect(grace.getByText("kickoff call")).toBeVisible();

  // She asks the client a question, and the ruling splits the money.
  await grace.getByRole("button", { name: "Ask for more information" }).click();
  await grace.selectOption("#ask-to", "client");
  await grace.fill("#ask-q", "Which pages are formal?");
  await grace.locator("dialog[open] button[type=submit]").click();
  await expect(grace.locator(".notice.ok")).toContainText("Question sent");
  await amina.goto(url);
  await expect(amina.getByText("The arbitrator asked you")).toBeVisible();

  await grace.goto(grace.url());
  await grace.getByRole("button", { name: "Record ruling" }).click();
  await grace.getByLabel(/Split between them/).check();
  await grace.fill("#pct", "50");
  await grace.fill("#note", "Half of the pages match the guide.");
  await grace.locator("dialog[open] button[type=submit]").click();
  await expect(grace.locator(".notice.ok")).toContainText("Ruling recorded");

  await amina.goto(url);
  await expect(amina.getByText("Resolved (split)").first()).toBeVisible();
  await expect(amina.getByText(/Half of the pages match/)).toBeVisible();
});

test("an administrator can suspend a user, who is then locked out until reactivated [FR-9.2, FR-9.6]", async ({ browser }) => {
  const daniel = await login(browser, "daniel");
  const kevin = await login(browser, "kevin");
  await daniel.goto("/admin");
  await daniel.locator("tr", { hasText: "Kevin Mwangi" }).getByRole("button", { name: "Suspend" }).click();
  await daniel.fill("dialog[open] textarea", "Policy violation");
  await daniel.locator("dialog[open] button[type=submit]").click();
  await expect(daniel.locator(".notice.ok")).toContainText("User suspended");
  await kevin.goto("/dashboard");
  await expect(kevin).toHaveURL(/\/suspended$/);
  await expect(kevin.getByText("Your account is suspended")).toBeVisible();
  await daniel.locator("tr", { hasText: "Kevin Mwangi" }).getByRole("button", { name: "Reactivate" }).click();
  await expect(daniel.locator(".notice.ok")).toContainText("User reactivated");
  await kevin.goto("/dashboard");
  await expect(kevin).not.toHaveURL(/suspended/);
});

test("settings changes are saved, applied and written to the audit log [FR-9.4, FR-8.7]", async ({ browser }) => {
  const daniel = await login(browser, "daniel");
  await daniel.goto("/admin#settings");
  await daniel.fill("#s-evid", "4");
  await daniel.getByRole("button", { name: "Save settings" }).click();
  await expect(daniel.locator(".notice.ok")).toContainText("Settings saved");
  await expect(daniel.locator("#s-evid")).toHaveValue("4");
  await daniel.goto("/audit");
  await expect(daniel.getByText("admin.settings_changed").first()).toBeVisible();
});

async function confirmDialogWithReason(page: import("@playwright/test").Page, trigger: string, field: string, reason: string) {
  await page.getByRole("button", { name: trigger }).first().click();
  await page.locator(`dialog[open] ${field}`).fill(reason);
  await page.locator("dialog[open] button[type=submit]").click();
}
void confirmDialog;
