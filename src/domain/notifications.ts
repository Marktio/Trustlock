import type { ParsedAudit } from "./audit";
import type { Contract, User } from "./types";

/**
 * Notifications are derived from the audit log, so they cannot drift from what really happened (FR-7.1).
 * Every message is built from a fixed template plus the contract title and a person's name. Free text that a user typed
 * (reasons, evidence, messages) is never copied in, and nothing secret is ever in the audit log to begin with (FR-7.5).
 */

export const READ_ACTION = "notifications.read";

export interface Notification {
  /** The audit sequence number, which is unique and increases. */
  id: number;
  at: string;
  contractId: string | null;
  title: string;
  body: string;
  unread: boolean;
  /** Whether a simulated email was also sent for this event (FR-7.2). */
  emailed: boolean;
}

export interface SimulatedEmail {
  id: number;
  at: string;
  to: string;
  toName: string;
  subject: string;
  body: string;
  contractId: string | null;
}

/** Optional translator for the fixed template text. Names and titles are filled in after translating. */
export type Tr = (text: string) => string;
const same: Tr = (s) => s;

type To = "other" | "both" | "arbitrator";
interface Template {
  to: To;
  title: (c: string, who: string, tr?: Tr) => string;
  body: (c: string, who: string, tr?: Tr) => string;
  email?: boolean;
}

const T = (to: To, title: string, body: string, email = false): Template => ({
  to,
  title: (c, who, tr = same) => tr(title).replace("{c}", c).replace("{who}", who),
  body: (c, who, tr = same) => tr(body).replace("{c}", c).replace("{who}", who),
  email,
});

const TEMPLATES: Record<string, Template> = {
  "contract.proposed": T("other", "New contract proposal", "{who} proposed “{c}”. Open it to accept, counter-propose or reject.", true),
  "contract.accept": T("other", "Proposal accepted", "{who} accepted “{c}”. The next step is funding the escrow."),
  "contract.counter_propose": T("other", "New terms proposed", "{who} proposed new terms for “{c}”. Review and answer them."),
  "contract.accept_counter": T("other", "New terms accepted", "{who} accepted your new terms for “{c}”."),
  "contract.decline_counter": T("other", "New terms declined", "{who} declined the new terms for “{c}”. The contract is cancelled."),
  "contract.reject": T("other", "Proposal rejected", "{who} rejected “{c}”."),
  "contract.cancel": T("other", "Contract cancelled", "{who} cancelled “{c}”. No money had moved."),
  "contract.cancel_requested": T("other", "Request to cancel", "{who} asked to cancel the funded contract “{c}”. It ends only if you agree.", true),
  "contract.cancel_declined": T("other", "Request to cancel turned down", "{who} wants to keep “{c}” going."),
  "contract.mutual_cancel": T("both", "Cancelled by agreement", "“{c}” was cancelled by agreement. The held money went back to the client.", true),
  "contract.fund": T("other", "Escrow funded", "{who} funded the escrow for “{c}”. You can start work.", true),
  "contract.start_work": T("other", "Work started", "{who} started work on “{c}”."),
  "contract.deliver": T("other", "Work delivered", "{who} delivered “{c}”. Review it before the review period ends.", true),
  "contract.request_revision": T("other", "Revision requested", "{who} asked for a revision on “{c}”.", true),
  "contract.approve": T("other", "Delivery approved", "{who} approved “{c}”. Payment is being released.", true),
  "contract.review_period_ends": T("both", "Review period ended", "The review period for “{c}” ended, so it was approved automatically."),
  "escrow.released": T("both", "Payment released", "The payment for “{c}” was released from escrow.", true),
  "contract.expire_proposal": T("both", "Proposal expired", "The proposal for “{c}” expired without an answer."),
  "contract.expire_unfunded": T("both", "Funding deadline passed", "“{c}” expired because it was not funded in time."),
  "contract.raise_dispute": T("other", "Dispute raised", "{who} raised a dispute on “{c}”. The money stays held until an arbitrator rules.", true),
  "dispute.assigned": T("both", "Arbitrator assigned", "An arbitrator was assigned to the dispute on “{c}”."),
  "dispute.withdraw_requested": T("other", "Request to withdraw the dispute", "{who} asked to withdraw the dispute on “{c}”. It ends only if you agree."),
  "contract.withdraw_dispute": T("both", "Dispute withdrawn", "The dispute on “{c}” was withdrawn by agreement."),
  "evidence.submitted": T("other", "Evidence added", "{who} added evidence to the dispute on “{c}”."),
  "contract.rule_release": T("both", "Dispute resolved", "The arbitrator ruled that the payment for “{c}” goes to the freelancer.", true),
  "contract.rule_refund": T("both", "Dispute resolved", "The arbitrator ruled that the money for “{c}” goes back to the client.", true),
  "contract.rule_split": T("both", "Dispute resolved", "The arbitrator split the money for “{c}” between both sides.", true),
  "message.sent": T("other", "New message", "{who} sent a message on “{c}”."),
};

const ASSIGNED_ARBITRATOR: Template = T("arbitrator", "New case assigned", "You were assigned the dispute on “{c}”.");

export interface NotificationInput {
  entries: readonly ParsedAudit[];
  contracts: ReadonlyMap<string, Contract>;
  users: ReadonlyMap<string, User>;
}

interface Event {
  seq: number;
  at: string;
  contractId: string | null;
  recipientId: string;
  title: string;
  body: string;
  email: boolean;
}

function recipients(t: Template, c: Contract, e: ParsedAudit): string[] {
  const parties = [c.clientId, c.freelancerId];
  if (t.to === "both") return parties;
  return parties.filter((id) => id !== e.actorId);
}

function securityEvent(e: ParsedAudit, tr: Tr): Event | null {
  const suspended = e.action === "admin.suspend_user";
  if (e.targetType !== "user" || (!suspended && e.action !== "admin.reactivate_user")) return null;
  return {
    seq: e.seq, at: e.at, contractId: null, recipientId: e.targetId, email: true,
    title: tr(suspended ? "Security alert: account suspended" : "Security alert: account reactivated"),
    body: tr(suspended ? "An administrator suspended your account. You cannot act on contracts until it is reactivated." : "An administrator reactivated your account."),
  };
}

function contractEvents(e: ParsedAudit, { contracts, users }: NotificationInput, tr: Tr): Event[] {
  const contract = e.targetType === "contract" ? contracts.get(e.targetId) : undefined;
  const t = TEMPLATES[e.action];
  if (!contract || !t) return [];
  const who = e.actorId ? (users.get(e.actorId)?.name ?? tr("Someone")) : "TrustLock";
  const make = (recipientId: string, tpl: Template): Event => ({
    seq: e.seq, at: e.at, contractId: contract.id, recipientId, email: !!tpl.email, title: tpl.title(contract.title, who, tr), body: tpl.body(contract.title, who, tr),
  });
  const out = recipients(t, contract, e).map((id) => make(id, t));
  const arb = e.action === "dispute.assigned" ? (e.after as { arbitratorId?: string } | null)?.arbitratorId : undefined;
  if (arb) out.push(make(arb, ASSIGNED_ARBITRATOR));
  return out;
}

/** Everything that was said to everyone, oldest first. Filtering to one person happens after. */
function events(input: NotificationInput, tr: Tr): Event[] {
  const out: Event[] = [];
  for (const e of input.entries) {
    if (e.result !== "ok") continue;
    const security = securityEvent(e, tr);
    if (security) out.push(security);
    else out.push(...contractEvents(e, input, tr));
  }
  return out;
}

export function notificationsFor(input: NotificationInput, userId: string, tr: Tr = same): { items: Notification[]; unread: number } {
  const lastRead = input.entries
    .filter((e) => e.action === READ_ACTION && e.actorId === userId && e.result === "ok")
    .reduce((max, e) => Math.max(max, (e.after as { upToSeq?: number } | null)?.upToSeq ?? 0), 0);
  const items = events(input, tr)
    .filter((n) => n.recipientId === userId)
    .map((n): Notification => ({ id: n.seq, at: n.at, contractId: n.contractId, title: n.title, body: n.body, unread: n.seq > lastRead, emailed: n.email }))
    .sort((a, b) => b.id - a.id);
  return { items, unread: items.filter((n) => n.unread).length };
}

/** The mail catcher: every simulated email that was "sent", newest first. Only available in development and demo mode. */
export function simulatedEmails(input: NotificationInput, tr: Tr = same): SimulatedEmail[] {
  return events(input, tr)
    .filter((n) => n.email)
    .flatMap((n) => {
      const u = input.users.get(n.recipientId);
      return u ? [{ id: n.seq, at: n.at, to: u.email, toName: u.name, subject: `[TrustLock] ${n.title}`, body: `${tr("Hello")} ${u.name},\n\n${n.body}\n\n${tr("This is a simulation. No real money is involved.")}`, contractId: n.contractId }] : [];
    })
    .sort((a, b) => b.id - a.id);
}
