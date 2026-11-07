import { DomainError, InsufficientFundsError } from "./errors";
import type { PaymentGateway } from "./gateway";
import { fundPostings, refundPostings, releasePostings, topUpPostings, withdrawPostings, walletAvailable, walletHeld, GATEWAY_ACCOUNT, FEES_ACCOUNT } from "./ledger";
import { feeFor, formatSC, scToMinor, splitAmount, MoneyError, type Minor } from "./money";
import type { EscrowRepository } from "./repository";
import { randomUUID } from "node:crypto";
import {
  ASSIGN_ACTION,
  EVIDENCE_ACTION,
  INFO_REQUEST_ACTION, WITHDRAW_REQUEST_ACTION, CANCEL_REQUEST_ACTION, CANCEL_DECLINED_ACTION,
  REACTIVATE_ACTION,
  SETTINGS_ACTION,
  SUSPEND_ACTION,
  caseFileFrom,
  deriveState,
  evidenceDigest,
  termsHistory,
  type CaseFile,
  type Derived,
  type Party,
  type Terms,
  type TermsVersion,
} from "./derived";
import {
  MAX_EVIDENCE_FILES,
  counterSchema,
  createContractSchema,
  deliverSchema,
  evidenceSchema,
  infoRequestSchema,
  messageSchema,
  parse,
  reasonSchema,
  rulingSchema,
  settingsSchema,
  staffSchema,
} from "./schemas";
import {
  IllegalTransitionError,
  canTransition,
  isTerminal,
  nextState,
  type ActorKind,
  type ContractState,
  type EscrowEvent,
} from "./states";
import { notificationsFor, simulatedEmails, READ_ACTION as NOTIFICATIONS_READ, type NotificationInput, type Tr } from "./notifications";
import { parseAudit, verifyChain, type ChainResult, type ParsedAudit } from "./audit";
import type { Actor, Balances, Clock, Contract, ContractPatch, LedgerRecord, Milestone, Posting, Role, User } from "./types";

export interface EscrowConfig {
  feeBps: number;
  proposalDays: number;
  fundingDays: number;
  topUpMin: Minor;
  topUpMax: Minor;
  topUpDailyMax: Minor;
  /** Defaults the new-contract form starts with (FR-9.4). */
  defaultReviewDays: number;
  defaultRevisionLimit: number;
  /** How long both parties can add evidence after a dispute is raised (FR-6.3). */
  evidenceDays: number;
  /** How long an arbitrator has to decide before the case is flagged as overdue (FR-6.9). */
  arbitrationDays: number;
}

/** The settings an administrator can change. Everything else in EscrowConfig is fixed by the code. */
export const SETTING_KEYS = [
  "feeBps",
  "proposalDays",
  "fundingDays",
  "defaultReviewDays",
  "defaultRevisionLimit",
  "evidenceDays",
  "arbitrationDays",
  "topUpMin",
  "topUpMax",
  "topUpDailyMax",
] as const satisfies readonly (keyof EscrowConfig)[];

export const DEFAULT_CONFIG: EscrowConfig = {
  feeBps: 200,
  proposalDays: 7,
  fundingDays: 7,
  topUpMin: 10 * 100,
  topUpMax: 100_000 * 100,
  topUpDailyMax: 500_000 * 100,
  defaultReviewDays: 3,
  defaultRevisionLimit: 2,
  evidenceDays: 5,
  arbitrationDays: 7,
};

export type ContractAction =
  | "accept"
  | "counter_propose"
  | "accept_counter"
  | "decline_counter"
  | "reject"
  | "cancel"
  | "fund"
  | "start_work"
  | "deliver"
  | "approve"
  | "request_revision"
  | "raise_dispute"
  | "withdraw_dispute"
  | "mutual_cancel";

export type Ruling = "release" | "refund" | "split";

export const MESSAGE_ACTION = "message.sent";
const MESSAGE_LIMIT_PER_MINUTE = 10;

const ACTION_EVENT: Record<ContractAction, EscrowEvent> = {
  accept: "accept",
  counter_propose: "counter_propose",
  accept_counter: "accept_counter",
  decline_counter: "decline_counter",
  reject: "reject",
  cancel: "cancel",
  fund: "fund",
  start_work: "start_work",
  deliver: "deliver",
  approve: "approve",
  request_revision: "request_revision",
  raise_dispute: "raise_dispute",
  withdraw_dispute: "withdraw_dispute",
  mutual_cancel: "mutual_cancel",
};

interface Who {
  id: string | null;
  role: string;
  kind: ActorKind;
}

export interface ContractView {
  contract: Contract;
  viewerKind: "client" | "freelancer";
  client: User;
  freelancer: User;
  /** Contract events only. Messages are in `messages`. */
  timeline: ParsedAudit[];
  messages: ParsedAudit[];
  /** Who opened the current dispute and why, while the contract is disputed. */
  dispute: { reason: string; raisedBy: string | null; at: string; stateBefore: ContractState | null; withdrawRequestedBy: string | null } | null;
  actions: ContractAction[];
  /** Who asked to cancel a funded contract and is waiting for the other party, if anyone. */
  cancelRequestedBy: string | null;
  /** Which version of the terms is current, who has to answer it, and every version so far (FR-3.3). */
  terms: { version: number; awaiting: Party; history: TermsVersion[] };
  /** Evidence, arbitrator questions and deadlines for the open dispute (FR-6.3, FR-6.5). Null when there is no dispute. */
  caseFile: CaseView | null;
  /** Can the viewer add evidence right now, and how many files can they still attach? */
  evidence: { canSubmit: boolean; filesLeft: number };
}

export interface CaseView extends CaseFile {
  assignedName: string | null;
  evidenceOpen: boolean;
  overdue: boolean;
}

export interface DisputeQueueRow {
  contract: Contract;
  client: User;
  freelancer: User;
  raisedAt: string;
  reason: string;
  assignedTo: User | null;
  overdue: boolean;
  dueAt: string;
}

const DAY_MS = 86_400_000;

const termsOf = (c: Contract): Terms => ({ amount: c.amount, milestones: c.milestones, reviewPeriodDays: c.reviewPeriodDays, revisionLimit: c.revisionLimit });

/** Field by field, because a database may return JSON keys in a different order. */
function sameTerms(a: Terms, b: Terms): boolean {
  return (
    a.amount === b.amount &&
    a.reviewPeriodDays === b.reviewPeriodDays &&
    a.revisionLimit === b.revisionLimit &&
    a.milestones.length === b.milestones.length &&
    a.milestones.every((m, i) => m.title === b.milestones[i].title && m.dueDate === b.milestones[i].dueDate && m.amount === b.milestones[i].amount)
  );
}

/**
 * Contract, funding, delivery and release rules.
 * The state machine decides what is legal, the ledger module builds money movements,
 * and the repository performs the atomic write. This class only connects them (Dependency Inversion).
 */
export class EscrowService {
  constructor(
    private readonly repo: EscrowRepository,
    private readonly clock: Clock,
    private readonly gateway: PaymentGateway,
    private readonly config: EscrowConfig = DEFAULT_CONFIG,
  ) {}

  // ---------- Reading ----------

  async listContracts(actor: Actor): Promise<{ contract: Contract; counterpart: User | null; viewerKind: "client" | "freelancer"; awaiting: Party }[]> {
    const [contracts, derived] = await Promise.all([this.repo.listContractsForUser(actor.id), this.derived()]);
    return Promise.all(
      contracts.map(async (contract) => {
        const viewerKind = contract.clientId === actor.id ? ("client" as const) : ("freelancer" as const);
        const counterpart = await this.repo.getUserById(viewerKind === "client" ? contract.freelancerId : contract.clientId);
        return { contract, counterpart, viewerKind, awaiting: derived.terms.get(contract.id)?.awaiting ?? ("freelancer" as Party) };
      }),
    );
  }

  async getContractView(actor: Actor, contractId: string): Promise<ContractView> {
    const { contract, kind } = await this.loadForParty(actor, contractId);
    const [client, freelancer, audit, derived, cfg] = await Promise.all([
      this.repo.getUserById(contract.clientId),
      this.repo.getUserById(contract.freelancerId),
      this.repo.listAudit(),
      this.derived(),
      this.getConfig(),
    ]);
    if (!client || !freelancer) throw new DomainError("NOT_FOUND", "We could not find that contract.");
    const all = audit.map(parseAudit).filter((e) => e.targetId === contract.id && e.targetType === "contract" && e.result === "ok");
    const caseFile = await this.buildCase(contract, all, derived, cfg);
    const awaiting = derived.terms.get(contract.id)?.awaiting ?? "freelancer";
    const mine = caseFile?.evidence.filter((e) => e.by === kind).reduce((n, e) => n + e.files.length, 0) ?? 0;
    const canSubmit = !!caseFile && (caseFile.evidenceOpen || caseFile.requests.some((r) => r.to === kind && !r.answered));
    return {
      contract,
      viewerKind: kind,
      client,
      freelancer,
      timeline: all.filter((e) => e.action !== MESSAGE_ACTION),
      messages: all.filter((e) => e.action === MESSAGE_ACTION),
      dispute: caseFile ? { reason: caseFile.reason, raisedBy: caseFile.raisedBy, at: caseFile.raisedAt, stateBefore: caseFile.stateBefore, withdrawRequestedBy: derived.disputes.get(contract.id)?.withdrawRequestedBy ?? null } : null,
      actions: this.actionsFor(contract, kind, awaiting),
      cancelRequestedBy: derived.cancelRequests.get(contract.id) ?? null,
      terms: { version: derived.terms.get(contract.id)?.version ?? 1, awaiting, history: termsHistory(all, termsOf(contract)) },
      caseFile,
      evidence: { canSubmit, filesLeft: Math.max(0, MAX_EVIDENCE_FILES - mine) },
    };
  }

  /** The case file for a disputed contract, with the assigned arbitrator's name and the deadlines. */
  private async buildCase(contract: Contract, entries: ParsedAudit[], derived: Derived, cfg: EscrowConfig): Promise<CaseView | null> {
    if (contract.state !== "disputed") return null;
    const info = derived.disputes.get(contract.id);
    if (!info) return null;
    const file = caseFileFrom(entries, info, contract.clientId, cfg.evidenceDays, cfg.arbitrationDays);
    const now = this.clock.now().getTime();
    const assigned = info.assignedTo ? await this.repo.getUserById(info.assignedTo) : null;
    return {
      ...file,
      assignedName: assigned?.name ?? null,
      evidenceOpen: now <= new Date(file.evidenceEndsAt).getTime(),
      overdue: now > new Date(file.decisionDueAt).getTime(),
    };
  }

  /** Arbitrator's queue: only the cases an administrator assigned to them, oldest first (FR-3.10, FR-6.4). */
  async listDisputes(actor: Actor): Promise<{ contract: Contract; client: User; freelancer: User; overdue: boolean; dueAt: string }[]> {
    this.requireRole(actor, ["arbitrator"]);
    const rows = await this.disputeRows();
    return rows
      .filter((r) => r.assignedTo?.id === actor.id)
      .map(({ contract, client, freelancer, overdue, dueAt }) => ({ contract, client, freelancer, overdue, dueAt }));
  }

  /** Administrator's view of every open dispute, assigned or not. */
  async listDisputeQueue(actor: Actor): Promise<DisputeQueueRow[]> {
    this.requireRole(actor, ["admin"]);
    return this.disputeRows();
  }

  private async disputeRows(): Promise<DisputeQueueRow[]> {
    const [disputed, derived, cfg] = await Promise.all([this.repo.listContractsByState("disputed"), this.derived(), this.getConfig()]);
    const now = this.clock.now().getTime();
    const rows = await Promise.all(
      disputed.map(async (contract) => {
        const info = derived.disputes.get(contract.id);
        if (!info) return null;
        const [client, freelancer, assignedTo] = await Promise.all([
          this.repo.getUserById(contract.clientId),
          this.repo.getUserById(contract.freelancerId),
          info.assignedTo ? this.repo.getUserById(info.assignedTo) : Promise.resolve(null),
        ]);
        if (!client || !freelancer) return null;
        const dueAt = new Date(new Date(info.raisedAt).getTime() + cfg.arbitrationDays * DAY_MS).toISOString();
        return { contract, client, freelancer, raisedAt: info.raisedAt, reason: info.reason, assignedTo, overdue: now > new Date(dueAt).getTime(), dueAt } satisfies DisputeQueueRow;
      }),
    );
    return rows.filter((r): r is DisputeQueueRow => r !== null).sort((a, b) => a.raisedAt.localeCompare(b.raisedAt));
  }

  /** What the assigned arbitrator sees for one case: both sides, the reason, evidence, messages and the timeline. Not limited to parties. */
  async getDisputeView(actor: Actor, contractId: string): Promise<Omit<ContractView, "viewerKind" | "actions" | "terms" | "evidence"> & { caseFile: CaseView }> {
    this.requireRole(actor, ["arbitrator"]);
    await this.assertActive(actor);
    const contract = await this.repo.getContract(contractId);
    const derived = await this.derived();
    // Cases assigned to someone else look the same as cases that do not exist.
    if (!contract || contract.state !== "disputed" || derived.disputes.get(contract.id)?.assignedTo !== actor.id) {
      throw new DomainError("NOT_FOUND", "We could not find an open dispute with that id.");
    }
    const [client, freelancer, audit, cfg] = await Promise.all([
      this.repo.getUserById(contract.clientId),
      this.repo.getUserById(contract.freelancerId),
      this.repo.listAudit(),
      this.getConfig(),
    ]);
    if (!client || !freelancer) throw new DomainError("NOT_FOUND", "We could not find that contract.");
    const all = audit.map(parseAudit).filter((e) => e.targetId === contract.id && e.targetType === "contract" && e.result === "ok");
    const caseFile = await this.buildCase(contract, all, derived, cfg);
    if (!caseFile) throw new DomainError("NOT_FOUND", "We could not find an open dispute with that id.");
    return {
      contract,
      client,
      freelancer,
      timeline: all.filter((e) => e.action !== MESSAGE_ACTION),
      messages: all.filter((e) => e.action === MESSAGE_ACTION),
      dispute: { reason: caseFile.reason, raisedBy: caseFile.raisedBy, at: caseFile.raisedAt, stateBefore: caseFile.stateBefore, withdrawRequestedBy: null },
      cancelRequestedBy: null,
      caseFile,
    };
  }

  /** `awaiting` says whose turn it is on a proposal. Only that side can answer it. */
  actionsFor(contract: Contract, kind: "client" | "freelancer", awaiting: Party = "freelancer"): ContractAction[] {
    return (Object.keys(ACTION_EVENT) as ContractAction[]).filter((action) => {
      if (!canTransition(contract.state, ACTION_EVENT[action], kind)) return false;
      if (action === "request_revision" && contract.revisionsUsed >= contract.revisionLimit) return false;
      if (contract.state === "proposed") {
        const clientsTurn = action === "accept_counter" || action === "decline_counter";
        if (clientsTurn ? awaiting !== "client" : awaiting !== "freelancer") return false;
      }
      return true;
    });
  }

  async getWallet(actor: Actor): Promise<{ balances: Balances; entries: LedgerRecord[] }> {
    const [balances, entries] = await Promise.all([this.repo.getBalances(actor.id), this.repo.listLedgerForUser(actor.id)]);
    return { balances, entries: entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
  }

  // ---------- Contract lifecycle ----------

  async createContract(actor: Actor, raw: unknown): Promise<Contract> {
    if (actor.role !== "client") throw new DomainError("FORBIDDEN", "Only clients can create contracts.");
    await this.assertActive(actor);
    const input = parse(createContractSchema, raw);
    const cfg = await this.getConfig();

    const freelancer = await this.repo.getUserByEmail(input.freelancerEmail);
    if (!freelancer || freelancer.role !== "freelancer") {
      throw new DomainError("VALIDATION", "No freelancer has signed up with that email. Ask them to sign up first.");
    }
    if (freelancer.id === actor.id) throw new DomainError("VALIDATION", "You cannot hire yourself.");

    const { total, milestones } = this.parseTerms(actor, input.totalSC, input.milestones);

    // Draft -> Proposed is checked against the state machine so the rules live in one place.
    const state = nextState("draft", "send_proposal", "client");
    const now = this.clock.now();
    const { contract } = await this.repo.commit({
      createContract: {
        title: input.title,
        description: input.description,
        clientId: actor.id,
        freelancerId: freelancer.id,
        amount: total,
        feeBps: cfg.feeBps,
        state,
        milestones,
        reviewPeriodDays: input.reviewPeriodDays,
        revisionLimit: input.revisionLimit,
        revisionsUsed: 0,
        expiresAt: new Date(now.getTime() + cfg.proposalDays * DAY_MS).toISOString(),
        deliveredAt: null,
        reviewEndsAt: null,
        deliverable: null,
        revisionReason: null,
      },
      audit: [
        { actorId: actor.id, actorRole: actor.role, action: "contract.created", targetType: "contract", targetId: "new", result: "ok", detail: input.title },
        { actorId: actor.id, actorRole: actor.role, action: "contract.proposed", targetType: "contract", targetId: "new", result: "ok", after: { state, amount: total } },
      ],
    });
    if (!contract) throw new Error("Contract was not created.");
    return contract;
  }

  /** Accepting starts the funding deadline: unfunded contracts expire after fundingDays (FR-4.7). */
  async accept(actor: Actor, id: string) {
    const cfg = await this.getConfig();
    return this.step(actor, id, "accept", () => ({
      patch: { expiresAt: new Date(this.clock.now().getTime() + cfg.fundingDays * DAY_MS).toISOString() },
    }), { awaiting: "freelancer" });
  }

  async reject(actor: Actor, id: string, reason: unknown) {
    const why = parse(reasonSchema, reason);
    return this.step(actor, id, "reject", () => ({ patch: { expiresAt: null } }), { detail: why, awaiting: "freelancer" });
  }

  // ---------- Counter-proposals (FR-3.3, FR-3.4) ----------

  /**
   * The freelancer changes the price, milestones, review period or revision limit instead of accepting.
   * The contract stays Proposed, the terms become a new version, and now the client has to answer.
   * Terms can only change here, while Proposed. Once funded no code path edits them (FR-3.4).
   */
  async counterPropose(actor: Actor, id: string, raw: unknown) {
    const input = parse(counterSchema, raw);
    const cfg = await this.getConfig();
    const { contract, kind } = await this.loadForParty(actor, id);
    // Whose turn it is comes before whether the numbers are right.
    const who: Who = { id: actor.id, role: actor.role, kind };
    await this.check(who, contract, "counter_propose");
    await this.requireAwaiting(who, contract, "counter_propose", "freelancer");
    const before = termsOf(contract);
    const { total, milestones } = this.parseTerms(actor, input.totalSC, input.milestones);
    const after: Terms = { amount: total, milestones, reviewPeriodDays: input.reviewPeriodDays, revisionLimit: input.revisionLimit };
    if (sameTerms(before, after)) throw new DomainError("VALIDATION", "Change at least one term before sending a counter-proposal.");
    return this.stepWithAudit(actor, id, "counter_propose", {
      awaiting: "freelancer",
      patch: { ...after, expiresAt: new Date(this.clock.now().getTime() + cfg.proposalDays * DAY_MS).toISOString() },
      detail: input.note,
      before: { ...before },
      after: { ...after },
    });
  }

  /** The client accepts the freelancer's version. The funding deadline starts now, as with a normal accept. */
  async acceptCounter(actor: Actor, id: string) {
    const cfg = await this.getConfig();
    return this.step(actor, id, "accept_counter", () => ({
      patch: { expiresAt: new Date(this.clock.now().getTime() + cfg.fundingDays * DAY_MS).toISOString() },
    }), { awaiting: "client" });
  }

  /** The client turns the counter-proposal down. Nothing was funded, so the contract is simply cancelled. */
  async declineCounter(actor: Actor, id: string, reason: unknown) {
    const why = parse(reasonSchema, reason);
    return this.step(actor, id, "decline_counter", () => ({ patch: { expiresAt: null } }), { detail: why, awaiting: "client" });
  }

  async cancel(actor: Actor, id: string, reason?: unknown) {
    const why = reason ? parse(reasonSchema, reason) : undefined;
    return this.step(actor, id, "cancel", () => ({ patch: { expiresAt: null } }), { detail: why });
  }

  async startWork(actor: Actor, id: string) {
    return this.step(actor, id, "start_work", () => ({}));
  }

  // ---------- Messages ----------

  /** Messages are written to the hash-chained audit log, so they cannot be edited or removed later and an arbitrator can rely on them. */
  async sendMessage(actor: Actor, id: string, raw: unknown): Promise<void> {
    const body = parse(messageSchema, raw);
    const { contract } = await this.loadForParty(actor, id);
    if (contract.state === "draft") throw new DomainError("ILLEGAL_TRANSITION", "Send the proposal before messaging.");
    const since = this.clock.now().getTime() - 60_000;
    const recent = (await this.repo.listAudit())
      .map(parseAudit)
      .filter((e) => e.action === MESSAGE_ACTION && e.actorId === actor.id && new Date(e.at).getTime() >= since).length;
    if (recent >= MESSAGE_LIMIT_PER_MINUTE) throw new DomainError("LIMIT", "You are sending messages too fast. Wait a minute and try again.");
    await this.repo.commit({
      audit: [{ actorId: actor.id, actorRole: actor.role, action: MESSAGE_ACTION, targetType: "contract", targetId: contract.id, result: "ok", detail: body }],
    });
  }

  // ---------- Disputes ----------

  async raiseDispute(actor: Actor, id: string, reason: unknown) {
    const why = parse(reasonSchema, reason);
    return this.step(actor, id, "raise_dispute", () => ({ patch: { reviewEndsAt: null } }), { detail: why });
  }

  /**
   * Withdrawing needs both parties (FR-6.8). The first call only records the request and the contract stays disputed;
   * when the other party also withdraws, the contract goes back to the state it was in, and a delivered contract gets a fresh review period.
   */
  async withdrawDispute(actor: Actor, id: string) {
    const { contract, kind } = await this.loadForParty(actor, id);
    await this.assertActive(actor);
    const view = await this.getContractView(actor, id);
    const previous = view.dispute?.stateBefore ?? undefined;
    const who: Who = { id: actor.id, role: actor.role, kind };
    const to = await this.check(who, contract, "withdraw_dispute", previous);
    const requestedBy = (await this.derived()).disputes.get(contract.id)?.withdrawRequestedBy ?? null;
    if (requestedBy === null || requestedBy === actor.id) {
      if (requestedBy === null) {
        await this.repo.commit({
          audit: [{ actorId: actor.id, actorRole: actor.role, action: WITHDRAW_REQUEST_ACTION, targetType: "contract", targetId: contract.id, result: "ok" }],
        });
      }
      return contract;
    }
    const now = this.clock.now();
    const patch: ContractPatch = { state: to };
    if (to === "delivered") patch.reviewEndsAt = new Date(now.getTime() + contract.reviewPeriodDays * DAY_MS).toISOString();
    const { contract: updated } = await this.repo.commit({
      contractId: contract.id,
      expectedVersion: contract.version,
      patch,
      audit: [{ actorId: actor.id, actorRole: actor.role, action: "contract.withdraw_dispute", targetType: "contract", targetId: contract.id, result: "ok", before: { state: contract.state }, after: { state: to } }],
    });
    return updated ?? contract;
  }

  /**
   * Cancelling after funding needs both parties (FR-3.7). The first call records the request; when the other party also
   * cancels, the held money goes back to the client in the same atomic write that changes the state.
   */
  async cancelFunded(actor: Actor, id: string) {
    const { contract, kind } = await this.loadForParty(actor, id);
    await this.assertActive(actor);
    const who: Who = { id: actor.id, role: actor.role, kind };
    const to = await this.check(who, contract, "mutual_cancel");
    const requestedBy = (await this.derived()).cancelRequests.get(contract.id) ?? null;
    if (requestedBy === null) {
      await this.repo.commit({
        audit: [{ actorId: actor.id, actorRole: actor.role, action: CANCEL_REQUEST_ACTION, targetType: "contract", targetId: contract.id, result: "ok" }],
      });
      return contract;
    }
    if (requestedBy === actor.id) return contract;
    const { contract: updated } = await this.repo.commit({
      idempotencyKey: `mutual-cancel:${contract.id}:${contract.version}`,
      contractId: contract.id,
      expectedVersion: contract.version,
      patch: { state: to },
      postings: refundPostings(contract.clientId, contract.amount),
      memo: `Cancelled by agreement: ${contract.title}`,
      audit: [
        { actorId: actor.id, actorRole: actor.role, action: "contract.mutual_cancel", targetType: "contract", targetId: contract.id, result: "ok", before: { state: contract.state }, after: { state: to, refunded: contract.amount } },
      ],
    });
    return updated ?? contract;
  }

  /** Turns down the other party's request to cancel a funded contract. The contract carries on. */
  async declineCancel(actor: Actor, id: string) {
    const { contract } = await this.loadForParty(actor, id);
    await this.assertActive(actor);
    const requestedBy = (await this.derived()).cancelRequests.get(contract.id) ?? null;
    if (!requestedBy || requestedBy === actor.id) throw new DomainError("ILLEGAL_TRANSITION", "There is no cancel request from the other party to turn down.");
    await this.repo.commit({
      audit: [{ actorId: actor.id, actorRole: actor.role, action: CANCEL_DECLINED_ACTION, targetType: "contract", targetId: contract.id, result: "ok" }],
    });
  }

  /**
   * The arbitrator's ruling moves the held money in the same atomic write that changes the state.
   * release: freelancer is paid as if approved. refund: client gets everything back. split: freelancer gets a percentage
   * (the platform fee comes out of the freelancer's share only), the client gets the rest.
   */
  async resolveDispute(actor: Actor, id: string, raw: unknown): Promise<Contract> {
    this.requireRole(actor, ["arbitrator"]);
    await this.assertActive(actor);
    const ruling = parse(rulingSchema, raw);
    const contract = await this.repo.getContract(id);
    // Only the arbitrator an administrator assigned can rule. Anyone else gets "not found" (FR-3.10, FR-6.4).
    if (!contract || (contract.state === "disputed" && (await this.derived()).disputes.get(contract.id)?.assignedTo !== actor.id)) {
      throw new DomainError("NOT_FOUND", "We could not find that contract.");
    }
    const who: Who = { id: actor.id, role: actor.role, kind: "arbitrator" };
    const event: EscrowEvent = ruling.decision === "release" ? "rule_release" : ruling.decision === "refund" ? "rule_refund" : "rule_split";
    const to = await this.check(who, contract, event);

    let postings: Posting[];
    let outcome: Record<string, unknown>;
    if (ruling.decision === "release") {
      const fee = feeFor(contract.amount, contract.feeBps);
      postings = releasePostings(contract.clientId, contract.freelancerId, contract.amount, fee);
      outcome = { toFreelancer: contract.amount - fee, fee, toClient: 0 };
    } else if (ruling.decision === "refund") {
      postings = refundPostings(contract.clientId, contract.amount);
      outcome = { toFreelancer: 0, fee: 0, toClient: contract.amount };
    } else {
      if (!ruling.freelancerPercent) throw new DomainError("VALIDATION", "Say what percentage the freelancer receives.");
      const parts = splitAmount(contract.amount, ruling.freelancerPercent);
      const fee = feeFor(parts.freelancer, contract.feeBps);
      postings = [
        { account: walletHeld(contract.clientId), delta: -contract.amount },
        { account: walletAvailable(contract.freelancerId), delta: parts.freelancer - fee },
        { account: walletAvailable(contract.clientId), delta: parts.client },
        ...(fee > 0 ? [{ account: FEES_ACCOUNT, delta: fee }] : []),
      ].filter((p) => p.delta !== 0);
      outcome = { toFreelancer: parts.freelancer - fee, fee, toClient: parts.client, freelancerPercent: ruling.freelancerPercent };
    }

    const { contract: updated } = await this.repo.commit({
      idempotencyKey: `ruling:${contract.id}:${contract.version}`,
      contractId: contract.id,
      expectedVersion: contract.version,
      patch: { state: to },
      postings,
      memo: `Dispute ruling (${ruling.decision}): ${contract.title}`,
      audit: [
        { actorId: actor.id, actorRole: actor.role, action: `contract.${event}`, targetType: "contract", targetId: contract.id, result: "ok", detail: ruling.note, before: { state: contract.state }, after: { state: to, ...outcome } },
      ],
    });
    return updated ?? contract;
  }

  // ---------- Money ----------

  async topUp(actor: Actor, amount: Minor, idempotencyKey: string | undefined) {
    if (actor.role !== "client") throw new DomainError("FORBIDDEN", "Only clients can top up a wallet.");
    await this.assertActive(actor);
    const cfg = await this.getConfig();
    const key = this.requireKey(idempotencyKey);
    const scoped = `${actor.id}:${key}`;
    if (await this.repo.findIdempotent(scoped)) return this.repo.getBalances(actor.id);

    if (!Number.isSafeInteger(amount) || amount < cfg.topUpMin || amount > cfg.topUpMax) {
      throw new DomainError("LIMIT", `Top up between ${this.fmt(actor, cfg.topUpMin)} and ${this.fmt(actor, cfg.topUpMax)} at a time.`);
    }
    const since = new Date(this.clock.now().getTime() - DAY_MS).toISOString();
    const today = await this.repo.sumTopUpsSince(actor.id, since);
    if (today + amount > cfg.topUpDailyMax) {
      throw new DomainError("LIMIT", `The daily top-up limit is ${this.fmt(actor, cfg.topUpDailyMax)}. You can add ${this.fmt(actor, Math.max(0, cfg.topUpDailyMax - today))} more today.`);
    }

    const result = await this.gateway.charge({ userId: actor.id, amount });
    if (!result.ok) {
      await this.repo.commit({
        audit: [{ actorId: actor.id, actorRole: actor.role, action: "wallet.topup", targetType: "wallet", targetId: actor.id, result: "rejected", detail: `Gateway ${result.reason}` }],
      });
      throw new DomainError("GATEWAY_FAILED", "The simulated payment did not go through. Nothing was added to your wallet. Try again.");
    }
    await this.repo.commit({
      idempotencyKey: scoped,
      postings: topUpPostings(actor.id, amount),
      memo: `Top-up (simulated ${result.method}) ${result.reference}`,
      audit: [{ actorId: actor.id, actorRole: actor.role, action: "wallet.topup", targetType: "wallet", targetId: actor.id, result: "ok", after: { amount, reference: result.reference } }],
    });
    return this.repo.getBalances(actor.id);
  }

  async withdraw(actor: Actor, amount: Minor, idempotencyKey: string | undefined) {
    if (actor.role !== "freelancer") throw new DomainError("FORBIDDEN", "Only freelancers can withdraw earnings.");
    await this.assertActive(actor);
    const key = this.requireKey(idempotencyKey);
    const scoped = `${actor.id}:${key}`;
    if (await this.repo.findIdempotent(scoped)) return this.repo.getBalances(actor.id);
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new DomainError("VALIDATION", "Enter an amount above zero.");
    const balances = await this.repo.getBalances(actor.id);
    if (amount > balances.available) {
      throw new InsufficientFundsError(`You asked for ${this.fmt(actor, amount)} but have ${this.fmt(actor, balances.available)} available.`);
    }
    const result = await this.gateway.payout({ userId: actor.id, amount });
    if (!result.ok) throw new DomainError("GATEWAY_FAILED", "The simulated withdrawal did not go through. Your balance is unchanged. Try again.");
    await this.repo.commit({
      idempotencyKey: scoped,
      postings: withdrawPostings(actor.id, amount),
      memo: `Withdrawal (simulated ${result.method}) ${result.reference}`,
      audit: [{ actorId: actor.id, actorRole: actor.role, action: "wallet.withdraw", targetType: "wallet", targetId: actor.id, result: "ok", after: { amount, reference: result.reference } }],
    });
    return this.repo.getBalances(actor.id);
  }

  async fund(actor: Actor, id: string, idempotencyKey: string | undefined) {
    const key = this.requireKey(idempotencyKey);
    const replay = await this.replayIfUsed(actor, id, key);
    if (replay) return replay;
    const { contract } = await this.loadForParty(actor, id);
    if (contract.clientId === actor.id && contract.state === "accepted") {
      const { available } = await this.repo.getBalances(actor.id);
      if (available < contract.amount) {
        throw new InsufficientFundsError(`You need ${this.fmt(actor, contract.amount)} but have ${this.fmt(actor, available)} available. Top up ${this.fmt(actor, contract.amount - available)} and try again.`);
      }
    }
    return this.step(
      actor,
      id,
      "fund",
      (c) => ({ postings: fundPostings(c.clientId, c.amount), memo: `Escrow funded: ${c.title}`, patch: { expiresAt: null } }),
      { idempotencyKey: `${actor.id}:${key}` },
    );
  }

  // ---------- Delivery and release ----------

  async deliver(actor: Actor, id: string, raw: unknown) {
    const file = parse(deliverSchema, raw);
    return this.step(actor, id, "deliver", (c) => {
      const now = this.clock.now();
      return {
        patch: {
          deliverable: { name: file.fileName, sizeBytes: file.sizeBytes, sha256: file.sha256, note: file.note ?? null },
          deliveredAt: now.toISOString(),
          reviewEndsAt: new Date(now.getTime() + c.reviewPeriodDays * DAY_MS).toISOString(),
          revisionReason: null,
        },
      };
    }, { detail: file.sha256 });
  }

  async requestRevision(actor: Actor, id: string, reason: unknown) {
    const why = parse(reasonSchema, reason);
    const { contract } = await this.loadForParty(actor, id);
    if (contract.state === "delivered" && contract.revisionsUsed >= contract.revisionLimit) {
      throw new DomainError("LIMIT", "You have used all revisions. You can approve the work or raise a dispute.");
    }
    return this.step(actor, id, "request_revision", (c) => ({
      patch: { revisionsUsed: c.revisionsUsed + 1, revisionReason: why, deliveredAt: null, reviewEndsAt: null, deliverable: null },
    }), { detail: why });
  }

  /** Client approves. Approval and release happen in one atomic write, so approved-but-unpaid cannot exist. */
  async approve(actor: Actor, id: string, idempotencyKey: string | undefined) {
    const key = this.requireKey(idempotencyKey);
    const replay = await this.replayIfUsed(actor, id, key);
    if (replay) return replay;
    const { contract, kind } = await this.loadForParty(actor, id);
    return (await this.approveAndRelease(contract, { id: actor.id, role: actor.role, kind }, "approve", `${actor.id}:${key}`)).contract;
  }

  /** Runs timed jobs: auto-approve after the review period, expire old proposals and unfunded contracts (FR-5.7, FR-3.8, FR-4.7). */
  async runScheduler(): Promise<{ released: number; expired: number; skipped: number }> {
    const now = this.clock.now();
    const result = { released: 0, expired: 0, skipped: 0 };
    await this.autoRelease(now, result);
    await this.expireOld(now, result);
    return result;
  }

  private async autoRelease(now: Date, result: { released: number; skipped: number }) {
    const who: Who = { id: null, role: "scheduler", kind: "scheduler" };
    for (const c of await this.repo.listContractsByState("delivered")) {
      if (!c.reviewEndsAt || new Date(c.reviewEndsAt) > now) continue;
      // A suspended party freezes the contract until an administrator reviews it (FR-9.6).
      if (await this.involvesSuspended(c)) {
        result.skipped += 1;
        continue;
      }
      try {
        // A replay means another run already released this contract, so it is not counted twice.
        const done = await this.approveAndRelease(c, who, "review_period_ends", `auto-release:${c.id}:${c.version}`);
        if (!done.replayed) result.released += 1;
      } catch {
        result.skipped += 1;
      }
    }
  }

  private async expireOld(now: Date, result: { expired: number; skipped: number }) {
    const expirable: [ContractState, EscrowEvent][] = [
      ["proposed", "expire_proposal"],
      ["accepted", "expire_unfunded"],
    ];
    for (const [state, event] of expirable) {
      for (const c of await this.repo.listContractsByState(state)) {
        if (!c.expiresAt || new Date(c.expiresAt) > now) continue;
        try {
          const to = nextState(c.state, event, "scheduler");
          const expired = await this.repo.commit({
            idempotencyKey: `expire:${c.id}:${c.version}`,
            contractId: c.id,
            expectedVersion: c.version,
            patch: { state: to, expiresAt: null },
            audit: [{ actorId: null, actorRole: "scheduler", action: `contract.${event}`, targetType: "contract", targetId: c.id, result: "ok", before: { state: c.state }, after: { state: to } }],
          });
          if (!expired.replayed) result.expired += 1;
        } catch {
          result.skipped += 1;
        }
      }
    }
  }

  // ---------- Evidence and questions (FR-6.3, FR-6.5) ----------

  /**
   * Either party adds text and/or up to five files to the open dispute during the evidence window.
   * Files are recorded by name, size and SHA-256 fingerprint. The entry goes into the hash-chained log,
   * so it can never be edited or deleted. An arbitrator's question reopens the window for the side that was asked.
   */
  async submitEvidence(actor: Actor, id: string, raw: unknown): Promise<void> {
    const input = parse(evidenceSchema, raw);
    const { contract, kind } = await this.loadForParty(actor, id);
    if (contract.state !== "disputed") throw new DomainError("ILLEGAL_TRANSITION", "Evidence can only be added while a dispute is open.");
    const entries = await this.contractEntries(contract.id);
    const file = await this.buildCase(contract, entries, await this.derived(), await this.getConfig());
    if (!file) throw new DomainError("NOT_FOUND", "We could not find an open dispute for this contract.");

    const used = file.evidence.filter((e) => e.by === kind).reduce((n, e) => n + e.files.length, 0);
    if (used + input.files.length > MAX_EVIDENCE_FILES) {
      throw new DomainError("LIMIT", `Each side can attach ${MAX_EVIDENCE_FILES} files in total. You have ${Math.max(0, MAX_EVIDENCE_FILES - used)} left.`);
    }
    const asked = file.requests.some((r) => r.to === kind && !r.answered);
    if (!file.evidenceOpen && !asked) {
      throw new DomainError("LIMIT", "The evidence window has closed. You can still answer a question from the arbitrator.");
    }
    const digest = evidenceDigest(input.text, input.files);
    await this.repo.commit({
      audit: [
        {
          actorId: actor.id,
          actorRole: actor.role,
          action: EVIDENCE_ACTION,
          targetType: "contract",
          targetId: contract.id,
          result: "ok",
          detail: input.text,
          after: { sha256: digest, files: input.files },
        },
      ],
    });
  }

  /** The assigned arbitrator asks one side for more information. The side can answer even after the evidence window closed. */
  async requestInfo(actor: Actor, id: string, raw: unknown): Promise<void> {
    this.requireRole(actor, ["arbitrator"]);
    await this.assertActive(actor);
    const input = parse(infoRequestSchema, raw);
    const contract = await this.repo.getContract(id);
    const info = contract?.state === "disputed" ? (await this.derived()).disputes.get(contract.id) : undefined;
    if (!contract || info?.assignedTo !== actor.id) throw new DomainError("NOT_FOUND", "We could not find an open dispute with that id.");
    await this.repo.commit({
      audit: [
        { actorId: actor.id, actorRole: actor.role, action: INFO_REQUEST_ACTION, targetType: "contract", targetId: contract.id, result: "ok", detail: input.question, after: { to: input.to } },
      ],
    });
  }

  private async contractEntries(contractId: string): Promise<ParsedAudit[]> {
    return (await this.repo.listAudit()).map(parseAudit).filter((e) => e.targetId === contractId && e.targetType === "contract" && e.result === "ok");
  }

  // ---------- Notifications (FR-7) ----------

  private async notificationInput(): Promise<NotificationInput> {
    const [audit, contracts, users] = await Promise.all([this.repo.listAudit(), this.repo.listAllContracts(), this.repo.listUsers()]);
    return {
      entries: audit.map(parseAudit),
      contracts: new Map(contracts.map((c) => [c.id, c])),
      users: new Map(users.map((u) => [u.id, u])),
    };
  }

  /** The viewer's own notifications, newest first. Nobody can read anyone else's. */
  async listNotifications(actor: Actor, tr?: Tr) {
    return notificationsFor(await this.notificationInput(), actor.id, tr);
  }

  async unreadCount(actor: Actor): Promise<number> {
    return (await this.listNotifications(actor)).unread;
  }

  /** Marks everything seen so far as read. Recorded in the audit log like any other action. */
  async markNotificationsRead(actor: Actor): Promise<void> {
    const { items, unread } = await this.listNotifications(actor);
    if (unread === 0) return;
    await this.repo.commit({
      audit: [{ actorId: actor.id, actorRole: actor.role, action: NOTIFICATIONS_READ, targetType: "user", targetId: actor.id, result: "ok", after: { upToSeq: items[0].id } }],
    });
  }

  /** The development mail catcher (FR-7.2): the simulated emails that were "sent". Administrators only. */
  async mailCatcher(actor: Actor, tr?: Tr) {
    this.requireRole(actor, ["admin"]);
    return simulatedEmails(await this.notificationInput(), tr);
  }

  // ---------- Administration (FR-9) ----------

  async adminOverview(actor: Actor) {
    this.requireRole(actor, ["admin"]);
    const [users, contracts, recon, audit, head, derived, cfg] = await Promise.all([
      this.repo.listUsers(),
      this.repo.listAllContracts(),
      this.reconcile(actor),
      this.repo.listAudit(),
      this.repo.getAuditHead(),
      this.derived(),
      this.getConfig(),
    ]);
    const usersByRole: Record<Role, number> = { client: 0, freelancer: 0, arbitrator: 0, admin: 0, auditor: 0 };
    for (const u of users) usersByRole[u.role] += 1;
    const contractsByState: Partial<Record<ContractState, number>> = {};
    for (const c of contracts) contractsByState[c.state] = (contractsByState[c.state] ?? 0) + 1;
    const since = this.clock.now().getTime() - DAY_MS;
    const parsed = audit.map(parseAudit);
    const queue = await this.disputeRows();
    return {
      usersByRole,
      suspended: derived.suspended.size,
      contractsByState,
      contractCount: contracts.length,
      held: recon.held,
      openDisputes: queue.length,
      unassigned: queue.filter((r) => !r.assignedTo).length,
      overdue: queue.filter((r) => r.overdue).length,
      rejectedLast24h: parsed.filter((e) => e.result === "rejected" && new Date(e.at).getTime() >= since).length,
      flagged: contracts.filter((c) => !isTerminal(c.state) && (derived.suspended.has(c.clientId) || derived.suspended.has(c.freelancerId))).length,
      health: { ledgerBalanced: recon.balanced, chainIntact: verifyChain(audit, head).ok, auditEntries: head.count },
      settings: cfg,
    };
  }

  async listUsers(actor: Actor, query = ""): Promise<{ user: User; suspended: boolean; contracts: number }[]> {
    this.requireRole(actor, ["admin"]);
    const [users, contracts, derived] = await Promise.all([this.repo.listUsers(), this.repo.listAllContracts(), this.derived()]);
    const needle = query.trim().toLowerCase();
    return users
      .filter((u) => !needle || u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle) || u.role.includes(needle))
      .map((user) => ({
        user,
        suspended: derived.suspended.has(user.id),
        contracts: contracts.filter((c) => c.clientId === user.id || c.freelancerId === user.id).length,
      }))
      .sort((a, b) => a.user.role.localeCompare(b.user.role) || a.user.name.localeCompare(b.user.name));
  }

  /** Suspended users cannot sign in or act. Their records stay, and their live contracts are frozen and flagged (FR-9.6). */
  async suspendUser(actor: Actor, userId: string, reason: unknown) {
    this.requireRole(actor, ["admin"]);
    const why = parse(reasonSchema, reason);
    const target = await this.repo.getUserById(userId);
    if (!target) throw new DomainError("NOT_FOUND", "We could not find that user.");
    if (target.id === actor.id) throw new DomainError("FORBIDDEN", "You cannot suspend your own account.");
    if (await this.isSuspended(userId)) throw new DomainError("CONFLICT", `${target.name} is already suspended.`);
    await this.repo.commit({
      audit: [{ actorId: actor.id, actorRole: actor.role, action: SUSPEND_ACTION, targetType: "user", targetId: userId, result: "ok", detail: why, after: { name: target.name, role: target.role } }],
    });
  }

  async reactivateUser(actor: Actor, userId: string) {
    this.requireRole(actor, ["admin"]);
    const target = await this.repo.getUserById(userId);
    if (!target) throw new DomainError("NOT_FOUND", "We could not find that user.");
    if (!(await this.isSuspended(userId))) throw new DomainError("CONFLICT", `${target.name} is not suspended.`);
    await this.repo.commit({
      audit: [{ actorId: actor.id, actorRole: actor.role, action: REACTIVATE_ACTION, targetType: "user", targetId: userId, result: "ok", after: { name: target.name, role: target.role } }],
    });
  }

  /**
   * Administrators create arbitrator and auditor accounts (FR-9.3). With "local" the profile is created here (demo mode).
   * With "invite" the caller has already sent a Clerk invitation, and the profile appears when that person first signs in.
   */
  async createStaffAccount(actor: Actor, raw: unknown, mode: "local" | "invite"): Promise<User | null> {
    this.requireRole(actor, ["admin"]);
    const input = parse(staffSchema, raw);
    if (await this.repo.getUserByEmail(input.email)) throw new DomainError("VALIDATION", "Someone already has an account with that email.");
    const user: User = { id: `staff_${randomUUID()}`, name: input.name, email: input.email, role: input.role };
    if (mode === "local") await this.repo.upsertUser(user);
    await this.repo.commit({
      audit: [
        {
          actorId: actor.id,
          actorRole: actor.role,
          action: mode === "local" ? "admin.create_user" : "admin.invite_user",
          targetType: "user",
          targetId: mode === "local" ? user.id : input.email,
          result: "ok",
          after: { name: input.name, email: input.email, role: input.role },
        },
      ],
    });
    return mode === "local" ? user : null;
  }

  /** Every change is validated, then written to the audit log with the old and new values (FR-9.4). */
  async updateSettings(actor: Actor, raw: unknown) {
    this.requireRole(actor, ["admin"]);
    const input = parse(settingsSchema, raw);
    const next = {
      feeBps: Math.round(input.feePercent * 100),
      proposalDays: input.proposalDays,
      fundingDays: input.fundingDays,
      defaultReviewDays: input.defaultReviewDays,
      defaultRevisionLimit: input.defaultRevisionLimit,
      evidenceDays: input.evidenceDays,
      arbitrationDays: input.arbitrationDays,
      topUpMin: this.money(input.topUpMinSC),
      topUpMax: this.money(input.topUpMaxSC),
      topUpDailyMax: this.money(input.topUpDailyMaxSC),
    } satisfies Record<(typeof SETTING_KEYS)[number], number>;
    if (next.topUpMin <= 0) throw new DomainError("VALIDATION", "The smallest top-up must be above zero.");
    if (next.topUpMax < next.topUpMin) throw new DomainError("VALIDATION", "The largest top-up cannot be below the smallest.");
    if (next.topUpDailyMax < next.topUpMax) throw new DomainError("VALIDATION", "The daily limit cannot be below the largest single top-up.");
    const current = await this.getConfig();
    const before = Object.fromEntries(SETTING_KEYS.map((k) => [k, current[k]]));
    if (SETTING_KEYS.every((k) => before[k] === next[k])) throw new DomainError("VALIDATION", "Nothing changed.");
    await this.repo.commit({
      audit: [{ actorId: actor.id, actorRole: actor.role, action: SETTINGS_ACTION, targetType: "platform", targetId: "settings", result: "ok", before, after: next }],
    });
    return next;
  }

  async listArbitrators(actor: Actor): Promise<{ user: User; openCases: number }[]> {
    this.requireRole(actor, ["admin"]);
    const [users, queue, derived] = await Promise.all([this.repo.listUsers(), this.disputeRows(), this.derived()]);
    return users
      .filter((u) => u.role === "arbitrator" && !derived.suspended.has(u.id))
      .map((user) => ({ user, openCases: queue.filter((r) => r.assignedTo?.id === user.id).length }))
      .sort((a, b) => a.openCases - b.openCases || a.user.name.localeCompare(b.user.name));
  }

  /** Assign, or reassign, an arbitrator to an open dispute. The arbitrator must not be a party to the contract (FR-6.4). */
  async assignArbitrator(actor: Actor, contractId: string, arbitratorId: string) {
    this.requireRole(actor, ["admin"]);
    const contract = await this.repo.getContract(contractId);
    const info = contract?.state === "disputed" ? (await this.derived()).disputes.get(contract.id) : undefined;
    if (!contract || !info) throw new DomainError("NOT_FOUND", "We could not find an open dispute with that id.");
    const arb = await this.repo.getUserById(arbitratorId);
    if (!arb || arb.role !== "arbitrator") throw new DomainError("VALIDATION", "Choose an arbitrator.");
    if (arb.id === contract.clientId || arb.id === contract.freelancerId) throw new DomainError("VALIDATION", "An arbitrator cannot rule on their own contract.");
    if (await this.isSuspended(arb.id)) throw new DomainError("VALIDATION", `${arb.name} is suspended.`);
    if (info.assignedTo === arb.id) throw new DomainError("CONFLICT", `${arb.name} already has this case.`);
    await this.repo.commit({
      audit: [
        {
          actorId: actor.id,
          actorRole: actor.role,
          action: ASSIGN_ACTION,
          targetType: "contract",
          targetId: contract.id,
          result: "ok",
          detail: info.assignedTo ? "Reassigned" : "Assigned",
          before: { arbitratorId: info.assignedTo },
          after: { arbitratorId: arb.id, arbitratorName: arb.name },
        },
      ],
    });
    return arb;
  }

  /** Picks the arbitrator with the fewest open cases. */
  async autoAssign(actor: Actor, contractId: string) {
    this.requireRole(actor, ["admin"]);
    const current = (await this.derived()).disputes.get(contractId)?.assignedTo;
    const pool = (await this.listArbitrators(actor)).filter((a) => a.user.id !== current);
    if (pool.length === 0) throw new DomainError("VALIDATION", "There is no other arbitrator available. Create one first.");
    return this.assignArbitrator(actor, contractId, pool[0].user.id);
  }

  // ---------- Audit and reconciliation ----------

  async verifyAuditChain(actor: Actor): Promise<ChainResult> {
    this.requireRole(actor, ["auditor", "admin"]);
    const [entries, head] = await Promise.all([this.repo.listAudit(), this.repo.getAuditHead()]);
    const result = verifyChain(entries, head);
    await this.repo.commit({
      audit: [{ actorId: actor.id, actorRole: actor.role, action: "audit.verify", targetType: "audit", targetId: "chain", result: result.ok ? "ok" : "rejected", detail: result.ok ? `${result.count} entries intact` : `Broken at entry ${result.brokenAt}` }],
    });
    return result;
  }

  /** Wallets + held + fee account must equal all credits issued by the gateway (FR-9.7, NFR-2.3). */
  async reconcile(actor: Actor) {
    this.requireRole(actor, ["auditor", "admin"]);
    const entries = await this.repo.listAllLedger();
    let available = 0, held = 0, fees = 0, gateway = 0, sum = 0;
    for (const e of entries) {
      sum += e.delta;
      if (e.account.endsWith(":available")) available += e.delta;
      else if (e.account.endsWith(":held")) held += e.delta;
      else if (e.account === FEES_ACCOUNT) fees += e.delta;
      else if (e.account === GATEWAY_ACCOUNT) gateway += e.delta;
    }
    const issued = -gateway;
    return { issued, available, held, fees, balanced: sum === 0 && available + held + fees === issued };
  }

  // ---------- Internals ----------

  // ----- Derived facts and settings -----

  private cache: { count: number; derived: Derived } | null = null;

  /**
   * Suspensions, settings, whose turn it is on a proposal and dispute assignments, all read from the audit log.
   * Cached by the log's entry count: any new entry changes the count, so the cache cannot go stale.
   */
  private async derived(): Promise<Derived> {
    const head = await this.repo.getAuditHead();
    if (this.cache && this.cache.count === head.count) return this.cache.derived;
    const derived = deriveState((await this.repo.listAudit()).map(parseAudit));
    this.cache = { count: head.count, derived };
    return derived;
  }

  /** The settings in force right now: the code's defaults with whatever an administrator last saved on top. */
  async getConfig(): Promise<EscrowConfig> {
    const saved = (await this.derived()).settings ?? {};
    const merged: EscrowConfig = { ...this.config };
    for (const key of SETTING_KEYS) {
      const v = saved[key];
      if (typeof v === "number" && Number.isFinite(v)) merged[key] = v;
    }
    return merged;
  }

  async isSuspended(userId: string): Promise<boolean> {
    return (await this.derived()).suspended.has(userId);
  }

  private async assertActive(actor: Actor) {
    if (await this.isSuspended(actor.id)) {
      throw new DomainError("FORBIDDEN", "Your account is suspended. Contact an administrator.");
    }
  }

  private async involvesSuspended(c: Contract): Promise<boolean> {
    const { suspended } = await this.derived();
    return suspended.has(c.clientId) || suspended.has(c.freelancerId);
  }

  /** On a proposal only one side can answer at a time. The wrong side is refused and the attempt is logged (FR-3.6). */
  private async requireAwaiting(who: Who, contract: Contract, event: EscrowEvent, party: Party) {
    if (contract.state !== "proposed") return;
    const awaiting = (await this.derived()).terms.get(contract.id)?.awaiting ?? "freelancer";
    if (awaiting === party) return;
    const message = awaiting === "client" ? "The freelancer made a counter-proposal. The client has to answer it first." : "The client has not answered yet. Wait for their reply.";
    await this.repo.commit({
      audit: [{ actorId: who.id, actorRole: who.role, action: `contract.${event}`, targetType: "contract", targetId: contract.id, result: "rejected", detail: message, before: { state: contract.state } }],
    });
    throw new DomainError("ILLEGAL_TRANSITION", message);
  }

  /** Parses the total and milestone amounts and checks they add up. Shared by new contracts and counter-proposals. */
  private parseTerms(actor: Actor, totalSC: string, rows: { title: string; dueDate: string; amountSC: string }[]): { total: Minor; milestones: Milestone[] } {
    const total = this.money(totalSC);
    if (total <= 0) throw new DomainError("VALIDATION", "The contract total must be more than zero.");
    const today = this.clock.now().toISOString().slice(0, 10);
    const milestones: Milestone[] = rows.map((m) => {
      if (m.dueDate < today) throw new DomainError("VALIDATION", `"${m.title}" is due in the past. Pick a later date.`);
      const amount = this.money(m.amountSC);
      if (amount <= 0) throw new DomainError("VALIDATION", `"${m.title}" needs an amount above zero.`);
      return { title: m.title, dueDate: m.dueDate, amount };
    });
    const sum = milestones.reduce((s, m) => s + m.amount, 0);
    if (sum !== total) {
      const diff = total - sum;
      throw new DomainError(
        "VALIDATION",
        diff > 0
          ? `Milestones add up to ${this.fmt(actor, sum)}. Add ${this.fmt(actor, diff)} or lower the total.`
          : `Milestones add up to ${this.fmt(actor, sum)}, which is ${this.fmt(actor, -diff)} over the total. Reduce a milestone or raise the total.`,
      );
    }
    return { total, milestones };
  }

  private money(text: string): Minor {
    try {
      return scToMinor(text);
    } catch (e) {
      if (e instanceof MoneyError) throw new DomainError("VALIDATION", e.message);
      throw e;
    }
  }

  private fmt(actor: Actor, minor: Minor): string {
    return formatSC(minor, true, actor.currency);
  }

  private requireKey(key: string | undefined): string {
    if (!key || key.length < 8 || key.length > 100) {
      throw new DomainError("IDEMPOTENCY_KEY_REQUIRED", "Something went wrong with this request. Reload the page and try again.");
    }
    return key;
  }

  private requireRole(actor: Actor, roles: Actor["role"][]) {
    if (!roles.includes(actor.role)) throw new DomainError("FORBIDDEN", "You do not have access to this.");
  }

  /** Non-parties get "not found", so nobody can probe which contract ids exist (IDOR, FR-3.10). */
  private async loadForParty(actor: Actor, id: string): Promise<{ contract: Contract; kind: "client" | "freelancer" }> {
    await this.assertActive(actor);
    const contract = await this.repo.getContract(id);
    const kind = contract ? (contract.clientId === actor.id ? "client" : contract.freelancerId === actor.id ? "freelancer" : null) : null;
    if (!contract || !kind) throw new DomainError("NOT_FOUND", "We could not find that contract.");
    return { contract, kind };
  }

  private async replayIfUsed(actor: Actor, id: string, key: string): Promise<Contract | null> {
    const used = await this.repo.findIdempotent(`${actor.id}:${key}`);
    if (!used) return null;
    const { contract } = await this.loadForParty(actor, id);
    return contract;
  }

  /** Checks the move against the state machine. An illegal or unauthorised move is written to the audit log, then refused (FR-3.6). */
  private async check(who: Who, contract: Contract, event: EscrowEvent, previous?: ContractState): Promise<ContractState> {
    try {
      return nextState(contract.state, event, who.kind, previous);
    } catch (e) {
      if (e instanceof IllegalTransitionError) {
        await this.repo.commit({
          audit: [{ actorId: who.id, actorRole: who.role, action: `contract.${event}`, targetType: "contract", targetId: contract.id, result: "rejected", detail: e.message, before: { state: contract.state } }],
        });
        throw new DomainError("ILLEGAL_TRANSITION", e.message);
      }
      throw e;
    }
  }

  private async step(
    actor: Actor,
    id: string,
    event: EscrowEvent,
    build: (c: Contract) => { patch?: ContractPatch; postings?: ReturnType<typeof fundPostings>; memo?: string },
    opts: { detail?: string; idempotencyKey?: string; awaiting?: Party; before?: unknown; after?: unknown } = {},
  ): Promise<Contract> {
    const { contract, kind } = await this.loadForParty(actor, id);
    const who: Who = { id: actor.id, role: actor.role, kind };
    const to = await this.check(who, contract, event);
    if (opts.awaiting) await this.requireAwaiting(who, contract, event, opts.awaiting);
    const plan = build(contract);
    const { contract: updated } = await this.repo.commit({
      idempotencyKey: opts.idempotencyKey,
      contractId: contract.id,
      expectedVersion: contract.version,
      patch: { ...plan.patch, state: to },
      postings: plan.postings,
      memo: plan.memo,
      audit: [{ actorId: actor.id, actorRole: actor.role, action: `contract.${event}`, targetType: "contract", targetId: contract.id, result: "ok", detail: opts.detail, before: opts.before ?? { state: contract.state }, after: opts.after ?? { state: to } }],
    });
    return updated ?? contract;
  }

  /** Same as step(), for moves that change the terms and record them in the audit entry instead of the state. */
  private stepWithAudit(
    actor: Actor,
    id: string,
    event: EscrowEvent,
    o: { awaiting: Party; patch: ContractPatch; detail: string; before: unknown; after: unknown },
  ) {
    return this.step(actor, id, event, () => ({ patch: o.patch }), { detail: o.detail, awaiting: o.awaiting, before: o.before, after: o.after });
  }

  private async approveAndRelease(contract: Contract, who: Who, trigger: "approve" | "review_period_ends", idempotencyKey: string): Promise<{ contract: Contract; replayed: boolean }> {
    const approved = await this.check(who, contract, trigger);
    // The release step is taken by the system, never by a user (the table only allows "system").
    const completed = nextState(approved, "release", "system");
    const fee = feeFor(contract.amount, contract.feeBps);
    const { contract: updated, replayed } = await this.repo.commit({
      idempotencyKey,
      contractId: contract.id,
      expectedVersion: contract.version,
      patch: { state: completed },
      postings: releasePostings(contract.clientId, contract.freelancerId, contract.amount, fee),
      memo: `Release: ${contract.title}`,
      audit: [
        { actorId: who.id, actorRole: who.role, action: `contract.${trigger}`, targetType: "contract", targetId: contract.id, result: "ok", before: { state: contract.state }, after: { state: approved } },
        { actorId: null, actorRole: "system", action: "escrow.released", targetType: "contract", targetId: contract.id, result: "ok", before: { state: approved }, after: { state: completed, amount: contract.amount, fee, paidToFreelancer: contract.amount - fee } },
      ],
    });
    return { contract: updated ?? contract, replayed };
  }
}
