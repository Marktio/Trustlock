import type { ParsedAudit } from "./audit";
import { sha256Hex } from "./audit";
import type { ContractState } from "./states";
import type { Milestone } from "./types";

/**
 * Facts the service needs on every request, worked out by reading the audit log in order.
 * The log is the single source of truth for them, so each one is tamper-evident and nothing needs an extra table:
 * who is suspended, the platform settings an administrator chose, whose turn it is on a proposal, and who is assigned to a dispute.
 * Pure functions: no I/O, so they are easy to test (Single Responsibility).
 */

export type Party = "client" | "freelancer";

export interface Terms {
  amount: number;
  milestones: Milestone[];
  reviewPeriodDays: number;
  revisionLimit: number;
}

export interface DisputeInfo {
  raisedAt: string;
  raisedBy: string | null;
  reason: string;
  stateBefore: ContractState | null;
  /** The arbitrator the administrator assigned for this dispute round, if any. */
  assignedTo: string | null;
  assignedAt: string | null;
  /** Who has asked to withdraw. The dispute only ends when the other party agrees too. */
  withdrawRequestedBy: string | null;
}

export interface Derived {
  suspended: Set<string>;
  /** The last settings an administrator saved. Merged over the defaults. */
  settings: Record<string, number> | null;
  /** For contracts that have been proposed: the version number and who has to answer next. */
  terms: Map<string, { version: number; awaiting: Party }>;
  /** Contracts that are in dispute right now. */
  disputes: Map<string, DisputeInfo>;
  /** Funded contracts where one party has asked to cancel and is waiting for the other to agree: contract id to requester. */
  cancelRequests: Map<string, string>;
}

export const SETTINGS_ACTION = "admin.settings_changed";
export const SUSPEND_ACTION = "admin.suspend_user";
export const REACTIVATE_ACTION = "admin.reactivate_user";
export const ASSIGN_ACTION = "dispute.assigned";
export const EVIDENCE_ACTION = "evidence.submitted";
export const INFO_REQUEST_ACTION = "dispute.info_requested";
export const WITHDRAW_REQUEST_ACTION = "dispute.withdraw_requested";
export const CANCEL_REQUEST_ACTION = "contract.cancel_requested";
export const CANCEL_DECLINED_ACTION = "contract.cancel_declined";

type Handler = (out: Derived, e: ParsedAudit) => void;

const endDispute: Handler = (out, e) => {
  out.disputes.delete(e.targetId);
};
const clearCancel: Handler = (out, e) => {
  out.cancelRequests.delete(e.targetId);
};

/** One small handler per audit action that changes derived state. Actions not listed here change nothing. */
const HANDLERS: Record<string, Handler> = {
  [SUSPEND_ACTION]: (out, e) => void out.suspended.add(e.targetId),
  [REACTIVATE_ACTION]: (out, e) => void out.suspended.delete(e.targetId),
  [SETTINGS_ACTION]: (out, e) => {
    out.settings = (e.after as Record<string, number> | null) ?? null;
  },
  "contract.proposed": (out, e) => {
    out.terms.set(e.targetId, { version: 1, awaiting: "freelancer" });
  },
  "contract.counter_propose": (out, e) => {
    const cur = out.terms.get(e.targetId) ?? { version: 1, awaiting: "freelancer" as Party };
    out.terms.set(e.targetId, { version: cur.version + 1, awaiting: "client" });
  },
  "contract.raise_dispute": (out, e) => {
    out.cancelRequests.delete(e.targetId);
    const before = (e.before as { state?: ContractState } | null)?.state ?? null;
    out.disputes.set(e.targetId, { raisedAt: e.at, raisedBy: e.actorId, reason: e.detail ?? "", stateBefore: before, assignedTo: null, assignedAt: null, withdrawRequestedBy: null });
  },
  [ASSIGN_ACTION]: (out, e) => {
    const d = out.disputes.get(e.targetId);
    if (!d) return;
    d.assignedTo = (e.after as { arbitratorId?: string } | null)?.arbitratorId ?? null;
    d.assignedAt = e.at;
  },
  [CANCEL_REQUEST_ACTION]: (out, e) => {
    if (e.actorId) out.cancelRequests.set(e.targetId, e.actorId);
  },
  [CANCEL_DECLINED_ACTION]: clearCancel,
  "contract.mutual_cancel": clearCancel,
  [WITHDRAW_REQUEST_ACTION]: (out, e) => {
    const d = out.disputes.get(e.targetId);
    if (d) d.withdrawRequestedBy = e.actorId;
  },
  "contract.withdraw_dispute": endDispute,
  "contract.rule_release": endDispute,
  "contract.rule_refund": endDispute,
  "contract.rule_split": endDispute,
};

export function deriveState(entries: readonly ParsedAudit[]): Derived {
  const out: Derived = { suspended: new Set(), settings: null, terms: new Map(), disputes: new Map(), cancelRequests: new Map() };
  for (const e of entries) {
    if (e.result === "ok") HANDLERS[e.action]?.(out, e);
  }
  return out;
}

// ---------- Terms history (counter-proposals) ----------

export interface TermsVersion {
  version: number;
  by: Party;
  at: string;
  note: string | null;
  terms: Terms;
  /** What the terms were before this version, so the client can see what changed. */
  previous: Terms | null;
}

/** Version 1 is the client's proposal. Each counter-proposal adds a version. Entries must be this contract's, in order. */
export function termsHistory(entries: readonly ParsedAudit[], current: Terms): TermsVersion[] {
  const counters = entries.filter((e) => e.action === "contract.counter_propose" && e.result === "ok");
  const first = (counters[0]?.before as Terms | null) ?? current;
  const created = entries.find((e) => e.action === "contract.proposed");
  const out: TermsVersion[] = [{ version: 1, by: "client", at: created?.at ?? "", note: null, terms: first, previous: null }];
  counters.forEach((c, i) => out.push({ version: i + 2, by: "freelancer", at: c.at, note: c.detail ?? null, terms: c.after as Terms, previous: c.before as Terms }));
  return out;
}

// ---------- Evidence and arbitrator questions (FR-6.3, FR-6.5) ----------

export interface EvidenceFile {
  name: string;
  sizeBytes: number;
  sha256: string;
}

export interface EvidenceItem {
  seq: number;
  at: string;
  byId: string | null;
  by: Party;
  text: string;
  files: EvidenceFile[];
  /** SHA-256 over the text and the file fingerprints, so the submission can be proven unchanged. */
  sha256: string;
}

export interface InfoRequest {
  seq: number;
  at: string;
  to: Party;
  question: string;
  answered: boolean;
}

export interface CaseFile {
  raisedAt: string;
  raisedBy: string | null;
  reason: string;
  stateBefore: ContractState | null;
  assignedTo: string | null;
  evidenceEndsAt: string;
  decisionDueAt: string;
  evidence: EvidenceItem[];
  requests: InfoRequest[];
}

export function evidenceDigest(text: string, files: readonly EvidenceFile[]): string {
  return sha256Hex(JSON.stringify({ text, files: files.map((f) => ({ name: f.name, sizeBytes: f.sizeBytes, sha256: f.sha256 })) }));
}

const DAY = 86_400_000;

/** Builds the case file for the current dispute round: only entries after the latest "raise_dispute" count. */
export function caseFileFrom(entries: readonly ParsedAudit[], info: DisputeInfo, clientId: string, evidenceDays: number, arbitrationDays: number): CaseFile {
  const ok = entries.filter((e) => e.result === "ok");
  const raisedIdx = ok.map((e) => e.action).lastIndexOf("contract.raise_dispute");
  const round = raisedIdx >= 0 ? ok.slice(raisedIdx + 1) : [];
  const evidence: EvidenceItem[] = round
    .filter((e) => e.action === EVIDENCE_ACTION)
    .map((e) => {
      const a = (e.after ?? {}) as { files?: EvidenceFile[]; sha256?: string };
      return { seq: e.seq, at: e.at, byId: e.actorId, by: e.actorId === clientId ? "client" : "freelancer", text: e.detail ?? "", files: a.files ?? [], sha256: a.sha256 ?? "" };
    });
  const requests: InfoRequest[] = round
    .filter((e) => e.action === INFO_REQUEST_ACTION)
    .map((e) => {
      const to = ((e.after as { to?: Party } | null)?.to ?? "client") as Party;
      return { seq: e.seq, at: e.at, to, question: e.detail ?? "", answered: evidence.some((v) => v.by === to && v.seq > e.seq) };
    });
  const raised = new Date(info.raisedAt).getTime();
  return {
    raisedAt: info.raisedAt,
    raisedBy: info.raisedBy,
    reason: info.reason,
    stateBefore: info.stateBefore,
    assignedTo: info.assignedTo,
    evidenceEndsAt: new Date(raised + evidenceDays * DAY).toISOString(),
    decisionDueAt: new Date(raised + arbitrationDays * DAY).toISOString(),
    evidence,
    requests,
  };
}
