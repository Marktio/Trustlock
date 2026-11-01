import { expect, test } from "@playwright/test";
import { confirmDialog, createContract, login } from "./helpers";

test.describe.configure({ mode: "serial" });

test("a client creates, funds and approves a contract and the freelancer is paid [FR-3.1, FR-3.9, FR-4.1, FR-5.1, FR-5.2, FR-5.3, FR-5.8, FR-2.1, NFR-5.2, NFR-5.4, NFR-7.4]", async ({ browser }) => {
  const amina = await login(browser, "amina");
  const brian = await login(browser, "brian");

  const url = await createContract(amina, { title: "E2E landing page copy", freelancerEmail: "brian@example.com", total: "5000" });
  await expect(amina.getByText("Waiting for Brian")).toBeVisible();

  // The freelancer accepts.
  await brian.goto(url);
  await expect(brian.getByText("Accept, counter or reject this proposal")).toBeVisible();
  await brian.getByRole("button", { name: "Accept contract" }).click();
  await expect(brian.locator(".notice.ok")).toContainText("Contract accepted");

  // The client funds. The dialog shows the arithmetic and nothing moves until confirmed.
  await amina.goto(url);
  await amina.getByRole("button", { name: /^Fund KSh 5,000/ }).click();
  await expect(amina.locator("dialog[open]")).toContainText("Available after");
  await amina.getByRole("button", { name: "Go back" }).click();
  await expect(amina.getByRole("button", { name: /^Fund KSh 5,000/ })).toBeVisible();
  await confirmDialog(amina, /^Fund KSh 5,000/);
  await expect(amina.locator(".notice.ok")).toContainText("Funds are locked in escrow");
  await expect(amina.getByText("Held in escrow")).toBeVisible();

  // Work and delivery, with the fingerprint calculated in the browser.
  await brian.goto(url);
  await brian.getByRole("button", { name: "Start work" }).click();
  await expect(brian.locator(".notice.ok")).toContainText("Work started");
  await brian.locator("#file").setInputFiles({ name: "copy.zip", mimeType: "application/zip", buffer: Buffer.from("the delivered work") });
  await expect(brian.getByText(/SHA-256 fingerprint/)).toBeVisible();
  await brian.getByRole("button", { name: "Submit delivery" }).click();
  await expect(brian.locator(".notice.ok")).toContainText("Delivered. The client now has");

  // The client reviews and approves. Release needs an explicit confirmation.
  await amina.goto(url);
  await amina.getByRole("link", { name: "Review delivery" }).click();
  await expect(amina.getByText("copy.zip")).toBeVisible();
  await amina.getByRole("button", { name: "Approve and release payment" }).click();
  await amina.getByRole("button", { name: "Go back" }).click();
  await expect(amina.getByRole("button", { name: "Approve and release payment" })).toBeVisible();
  await confirmDialog(amina, "Approve and release payment");
  await expect(amina.locator(".notice.ok")).toContainText("Payment was released to the freelancer");

  // 5,000 minus the 2% fee (100) reaches the freelancer, and the money screen says it is not real money.
  await brian.goto("/wallet");
  await expect(brian.getByText("Simulation only")).toBeVisible();
  await expect(brian.getByText("4,900").first()).toBeVisible();

  // The timeline names every step with a UTC time.
  await amina.goto(url);
  for (const label of ["Contract created", "Proposal sent", "Contract accepted", "Escrow funded", "Work delivered", "Payment released"]) {
    await expect(amina.getByText(label).first()).toBeVisible();
  }
  await expect(amina.getByText(/UTC/).first()).toBeVisible();
});

test("the auditor can verify the audit chain and the ledger balances after the journey [FR-8.4, FR-9.7, NFR-2.3]", async ({ browser }) => {
  const faith = await login(browser, "faith");
  await expect(faith.getByText("Ledger balanced")).toBeVisible();
  await faith.getByRole("button", { name: "Verify chain" }).click();
  await expect(faith.getByText(/Chain intact\. \d+ entries checked/)).toBeVisible();
});
