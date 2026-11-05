"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { DomainError } from "@/domain/errors";
import { scToMinor, MoneyError } from "@/domain/money";
import type { EscrowService } from "@/domain/escrow-service";
import type { Actor, Role } from "@/domain/types";
import { DEMO_COOKIE, SELF_SERVE_ROLES, clerkEnabled, requireViewer, toActor } from "@/server/auth";
import { getContainer } from "@/server/container";
import { REGION_COOKIE } from "@/server/region";
import { THEME_COOKIE } from "@/server/theme";

const text = (f: FormData, name: string) => String(f.get(name) ?? "");

function withParam(path: string, key: "error" | "ok", value: string) {
  const url = new URL(path, "http://x");
  url.searchParams.set(key, value.slice(0, 240));
  return url.pathname + url.search;
}

/**
 * Runs one action. A DomainError carries a message that is safe to show, so it goes back to the page.
 * Anything else is a bug and is left to the error page (NFR-1.10).
 */
async function perform(
  back: string,
  run: (svc: EscrowService, actor: Actor) => Promise<{ to?: string; ok?: string } | void>,
): Promise<never> {
  const viewer = await requireViewer();
  const { svc } = await getContainer();
  let target: string;
  try {
    const done = (await run(svc, toActor(viewer))) ?? {};
    target = done.ok ? withParam(done.to ?? back, "ok", done.ok) : (done.to ?? back);
  } catch (e) {
    if (e instanceof DomainError) target = withParam(back, "error", e.message);
    else if (e instanceof MoneyError) target = withParam(back, "error", e.message);
    else throw e;
  }
  redirect(target);
}

// ---------- Sign-in (demo mode) and role choice (Clerk) ----------

export async function demoLogin(formData: FormData) {
  if (clerkEnabled) redirect("/sign-in");
  const { repo } = await getContainer();
  const user = await repo.getUserById(text(formData, "userId"));
  if (!user) redirect("/demo");
  (await cookies()).set(DEMO_COOKIE, user.id, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect(user.role === "admin" ? "/admin" : user.role === "auditor" ? "/audit" : "/dashboard");
}

export async function demoLogout() {
  (await cookies()).delete(DEMO_COOKIE);
  redirect("/");
}

export async function chooseRole(formData: FormData) {
  if (!clerkEnabled) redirect("/demo");
  const role = text(formData, "role") as Role;
  // Only client and freelancer can be self-selected. Anything else is rejected on the server (FR-1.1, FR-1.13).
  if (!SELF_SERVE_ROLES.includes(role)) redirect("/onboarding?error=" + encodeURIComponent("Choose client or freelancer."));
  const { auth, clerkClient } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const client = await clerkClient();
  const existing = await client.users.getUser(userId);
  if (existing.publicMetadata?.role) redirect("/dashboard"); // a role, once set, cannot be changed here
  await client.users.updateUserMetadata(userId, { publicMetadata: { role } });
  redirect("/dashboard");
}

// ---------- Contracts ----------

export async function createContractAction(formData: FormData) {
  const titles = formData.getAll("m_title").map(String);
  const dues = formData.getAll("m_due").map(String);
  const amounts = formData.getAll("m_amount").map(String);
  const raw = {
    title: text(formData, "title"),
    description: text(formData, "description"),
    freelancerEmail: text(formData, "freelancerEmail"),
    totalSC: text(formData, "totalSC"),
    reviewPeriodDays: text(formData, "reviewPeriodDays"),
    revisionLimit: text(formData, "revisionLimit"),
    milestones: titles.map((title, i) => ({ title, dueDate: dues[i] ?? "", amountSC: amounts[i] ?? "" })),
  };
  return perform("/contracts/new", async (svc, actor) => {
    const c = await svc.createContract(actor, raw);
    return { to: `/contracts/${c.id}`, ok: "Proposal sent. You will be told when the freelancer replies." };
  });
}

const back = (id: string) => `/contracts/${id}`;

export async function acceptAction(f: FormData) {
  const id = text(f, "id");
  return perform(back(id), async (svc, a) => {
    await svc.accept(a, id);
    return { ok: "Contract accepted. The client can now fund it." };
  });
}
export async function rejectAction(f: FormData) {
  const id = text(f, "id");
  return perform(back(id), async (svc, a) => {
    await svc.reject(a, id, text(f, "reason"));
    return { ok: "Contract rejected." };
  });
}
export async function cancelAction(f: FormData) {
  const id = text(f, "id");
  return perform(back(id), async (svc, a) => {
    await svc.cancel(a, id, text(f, "reason") || undefined);
    return { ok: "Contract cancelled." };
  });
}
export async function cancelFundedAction(f: FormData) {
  const id = text(f, "id");
  return perform(back(id), async (svc, a) => {
    const after = await svc.cancelFunded(a, id);
    return after.state === "cancelled"
      ? { ok: "Contract cancelled by agreement. The held money is back in the client's wallet." }
      : { ok: "Your request to cancel is recorded. The contract is cancelled when the other person agrees too." };
  });
}
export async function declineCancelAction(f: FormData) {
  const id = text(f, "id");
  return perform(back(id), async (svc, a) => {
    await svc.declineCancel(a, id);
    return { ok: "Request turned down. The contract carries on." };
  });
}
export async function fundAction(f: FormData) {
  const id = text(f, "id");
  return perform(back(id), async (svc, a) => {
    await svc.fund(a, id, text(f, "key"));
    return { ok: "Funds are locked in escrow. The freelancer can start work." };
  });
}
export async function startWorkAction(f: FormData) {
  const id = text(f, "id");
  return perform(back(id), async (svc, a) => {
    await svc.startWork(a, id);
    return { ok: "Work started." };
  });
}
export async function deliverAction(f: FormData) {
  const id = text(f, "id");
  return perform(back(id), async (svc, a) => {
    await svc.deliver(a, id, {
      fileName: text(f, "fileName"),
      sizeBytes: Number(text(f, "sizeBytes")),
      sha256: text(f, "sha256"),
      note: text(f, "note") || undefined,
    });
    return { ok: "Delivered. The client now has the review period to respond." };
  });
}
export async function approveAction(f: FormData) {
  const id = text(f, "id");
  return perform(back(id), async (svc, a) => {
    await svc.approve(a, id, text(f, "key"));
    return { ok: "Approved. Payment was released to the freelancer." };
  });
}
export async function revisionAction(f: FormData) {
  const id = text(f, "id");
  return perform(back(id), async (svc, a) => {
    await svc.requestRevision(a, id, text(f, "reason"));
    return { ok: "Revision requested. The freelancer has been asked to resubmit." };
  });
}

// ---------- Wallet ----------

export async function topUpAction(f: FormData) {
  return perform("/wallet", async (svc, a) => {
    await svc.topUp(a, scToMinor(text(f, "amount")), text(f, "key"));
    return { ok: "Top-up complete." };
  });
}
export async function withdrawAction(f: FormData) {
  return perform("/wallet", async (svc, a) => {
    await svc.withdraw(a, scToMinor(text(f, "amount")), text(f, "key"));
    return { ok: "Withdrawal complete." };
  });
}

// ---------- Audit ----------

export async function verifyChainAction() {
  return perform("/audit", async (svc, a) => {
    const result = await svc.verifyAuditChain(a);
    if (result.ok) return { ok: `Chain intact. ${result.count} entries checked.` };
    throw new DomainError("CONFLICT", `Chain broken at entry ${result.brokenAt}. ${result.reason}`);
  });
}

/** Back to the page the visitor was on (path only, never another site). */
async function backToReferer(): Promise<never> {
  let to = "/";
  try {
    const ref = (await headers()).get("referer");
    if (ref) {
      const u = new URL(ref);
      to = u.pathname + u.search;
    }
  } catch {
    /* keep "/" */
  }
  redirect(to);
}

/** Region override from the picker. */
export async function setRegion(formData: FormData) {
  const country = text(formData, "country").toUpperCase();
  const jar = await cookies();
  if (/^[A-Z]{2}$/.test(country)) jar.set(REGION_COOKIE, country, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  else jar.delete(REGION_COOKIE);
  return backToReferer();
}

/** Light or dark override from the theme menu. "system" removes the choice so the device setting applies. */
export async function setTheme(formData: FormData) {
  const theme = text(formData, "theme");
  const jar = await cookies();
  if (theme === "light" || theme === "dark") jar.set(THEME_COOKIE, theme, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  else jar.delete(THEME_COOKIE);
  return backToReferer();
}

// ---------- Disputes and messages ----------

export async function raiseDisputeAction(f: FormData) {
  const id = text(f, "id");
  return perform(`/contracts/${id}`, async (svc, a) => {
    await svc.raiseDispute(a, id, text(f, "reason"));
    return { ok: "Dispute raised. An arbitrator will review the contract and its messages." };
  });
}

export async function withdrawDisputeAction(f: FormData) {
  const id = text(f, "id");
  return perform(`/contracts/${id}`, async (svc, a) => {
    const after = await svc.withdrawDispute(a, id);
    return after.state === "disputed"
      ? { ok: "Your request to withdraw is recorded. The dispute ends when the other person agrees too." }
      : { ok: "Dispute withdrawn. The contract is back where it was." };
  });
}

export async function sendMessageAction(f: FormData) {
  const id = text(f, "id");
  return perform(`/contracts/${id}`, async (svc, a) => {
    await svc.sendMessage(a, id, text(f, "body"));
    return { ok: "Message sent." };
  });
}

/** Arbitrator only. The service checks the role again and moves the money in the same atomic write as the state. */
export async function resolveDisputeAction(f: FormData) {
  const id = text(f, "id");
  return perform(`/cases/${id}`, async (svc, a) => {
    await svc.resolveDispute(a, id, {
      decision: text(f, "decision"),
      freelancerPercent: text(f, "decision") === "split" ? text(f, "freelancerPercent") : undefined,
      note: text(f, "note"),
    });
    return { to: "/dashboard", ok: "Ruling recorded. The money has been moved and both sides can see the outcome." };
  });
}

// ---------- Counter-proposals ----------

export async function counterProposeAction(f: FormData) {
  const id = text(f, "id");
  const titles = f.getAll("m_title").map(String);
  const dues = f.getAll("m_due").map(String);
  const amounts = f.getAll("m_amount").map(String);
  return perform(back(id), async (svc, a) => {
    await svc.counterPropose(a, id, {
      totalSC: text(f, "totalSC"),
      reviewPeriodDays: text(f, "reviewPeriodDays"),
      revisionLimit: text(f, "revisionLimit"),
      note: text(f, "note"),
      milestones: titles.map((title, i) => ({ title, dueDate: dues[i] ?? "", amountSC: amounts[i] ?? "" })),
    });
    return { ok: "Counter-proposal sent. The client has to accept it before you can go on." };
  });
}
export async function acceptCounterAction(f: FormData) {
  const id = text(f, "id");
  return perform(back(id), async (svc, a) => {
    await svc.acceptCounter(a, id);
    return { ok: "You accepted the new terms. You can fund the contract now." };
  });
}
export async function declineCounterAction(f: FormData) {
  const id = text(f, "id");
  return perform(back(id), async (svc, a) => {
    await svc.declineCounter(a, id, text(f, "reason"));
    return { ok: "Counter-proposal declined. The contract is cancelled." };
  });
}

// ---------- Evidence and arbitrator questions ----------

export async function submitEvidenceAction(f: FormData) {
  const id = text(f, "id");
  let files: unknown = [];
  try {
    files = JSON.parse(text(f, "files") || "[]");
  } catch {
    files = null;
  }
  return perform(`${back(id)}#evidence`, async (svc, a) => {
    await svc.submitEvidence(a, id, { text: text(f, "text"), files });
    return { to: `${back(id)}#evidence`, ok: "Evidence submitted. It cannot be edited or removed." };
  });
}

export async function requestInfoAction(f: FormData) {
  const id = text(f, "id");
  return perform(`/cases/${id}`, async (svc, a) => {
    await svc.requestInfo(a, id, { to: text(f, "to"), question: text(f, "question") });
    return { ok: "Question sent. That side can answer even if the evidence window has closed." };
  });
}

// ---------- Administration ----------

export async function suspendUserAction(f: FormData) {
  return perform("/admin#users", async (svc, a) => {
    await svc.suspendUser(a, text(f, "userId"), text(f, "reason"));
    return { to: "/admin#users", ok: "User suspended. They can no longer sign in or act, and their live contracts are flagged." };
  });
}
export async function reactivateUserAction(f: FormData) {
  return perform("/admin#users", async (svc, a) => {
    await svc.reactivateUser(a, text(f, "userId"));
    return { to: "/admin#users", ok: "User reactivated." };
  });
}

export async function createStaffAction(f: FormData) {
  const raw = { name: text(f, "name"), email: text(f, "email"), role: text(f, "role") };
  return perform("/admin#staff", async (svc, a) => {
    if (clerkEnabled) {
      // With Clerk the person has to sign up themselves. The invitation carries the role, so it is set the moment they do.
      await svc.createStaffAccount(a, raw, "invite");
      const { clerkClient } = await import("@clerk/nextjs/server");
      const client = await clerkClient();
      await client.invitations.createInvitation({ emailAddress: raw.email.trim().toLowerCase(), publicMetadata: { role: raw.role } });
      return { to: "/admin#staff", ok: `Invitation sent to ${raw.email}. They get the ${raw.role} role when they sign up.` };
    }
    const user = await svc.createStaffAccount(a, raw, "local");
    return { to: "/admin#staff", ok: `${user?.name} was added as ${raw.role}. In demo mode they appear on the sign-in picker.` };
  });
}

export async function updateSettingsAction(f: FormData) {
  const keys = ["feePercent", "defaultReviewDays", "defaultRevisionLimit", "proposalDays", "fundingDays", "evidenceDays", "arbitrationDays", "topUpMinSC", "topUpMaxSC", "topUpDailyMaxSC"];
  const raw = Object.fromEntries(keys.map((k) => [k, text(f, k)]));
  return perform("/admin#settings", async (svc, a) => {
    await svc.updateSettings(a, raw);
    return { to: "/admin#settings", ok: "Settings saved. New contracts and limits use them from now on, and the change is in the audit log." };
  });
}

export async function assignArbitratorAction(f: FormData) {
  const id = text(f, "id");
  return perform("/admin#disputes", async (svc, a) => {
    const arb = text(f, "arbitratorId") === "auto" ? await svc.autoAssign(a, id) : await svc.assignArbitrator(a, id, text(f, "arbitratorId"));
    return { to: "/admin#disputes", ok: `${arb.name} is now assigned to the case.` };
  });
}

export async function markNotificationsReadAction() {
  return perform("/notifications", async (svc, a) => {
    await svc.markNotificationsRead(a);
  });
}
