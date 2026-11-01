/**
 * The escrow state machine (System Documentation, section 7).
 * Every legal move is one row in RULES. Adding a state or event means adding rows, not editing logic (Open/Closed).
 * This module knows nothing about balances: it only decides which moves are legal and who may make them (Single Responsibility).
 */
export const CONTRACT_STATES = [
  "draft",
  "proposed",
  "accepted",
  "funded",
  "in_progress",
  "delivered",
  "approved",
  "completed",
  "disputed",
  "refunded",
  "resolved_split",
  "rejected",
  "cancelled",
  "expired",
] as const;

export type ContractState = (typeof CONTRACT_STATES)[number];

export const TERMINAL_STATES: readonly ContractState[] = [
  "completed",
  "refunded",
  "resolved_split",
  "rejected",
  "cancelled",
  "expired",
];

export type ActorKind = "client" | "freelancer" | "arbitrator" | "scheduler" | "system";

export const EVENTS = [
  "send_proposal",
  "accept",
  "counter_propose",
  "accept_counter",
  "decline_counter",
  "reject",
  "expire_proposal",
  "fund",
  "cancel",
  "expire_unfunded",
  "start_work",
  "deliver",
  "approve",
  "review_period_ends",
  "request_revision",
  "release",
  "raise_dispute",
  "rule_release",
  "rule_refund",
  "rule_split",
  "withdraw_dispute",
  "mutual_cancel",
] as const;

export type EscrowEvent = (typeof EVENTS)[number];

interface Rule {
  from: readonly ContractState[];
  event: EscrowEvent;
  /** "previous" is only used by withdraw_dispute and needs the state before the dispute. */
  to: ContractState | "previous";
  by: readonly ActorKind[];
}

export const RULES: readonly Rule[] = [
  { from: ["draft"], event: "send_proposal", to: "proposed", by: ["client"] },
  { from: ["proposed"], event: "accept", to: "accepted", by: ["freelancer"] },
  { from: ["proposed"], event: "counter_propose", to: "proposed", by: ["freelancer"] },
  // The client answers a counter-proposal (FR-3.3). Who is being asked is tracked by the service, not by the state.
  { from: ["proposed"], event: "accept_counter", to: "accepted", by: ["client"] },
  { from: ["proposed"], event: "decline_counter", to: "cancelled", by: ["client"] },
  { from: ["proposed"], event: "reject", to: "rejected", by: ["freelancer"] },
  { from: ["proposed"], event: "expire_proposal", to: "expired", by: ["scheduler"] },
  { from: ["accepted"], event: "fund", to: "funded", by: ["client"] },
  { from: ["accepted"], event: "cancel", to: "cancelled", by: ["client", "freelancer"] },
  { from: ["accepted"], event: "expire_unfunded", to: "expired", by: ["scheduler"] },
  // After funding the money is held, so cancelling needs both parties to agree (FR-3.7). The service checks the consent.
  { from: ["funded", "in_progress"], event: "mutual_cancel", to: "cancelled", by: ["client", "freelancer"] },
  { from: ["funded"], event: "start_work", to: "in_progress", by: ["freelancer"] },
  { from: ["in_progress"], event: "deliver", to: "delivered", by: ["freelancer"] },
  { from: ["delivered"], event: "approve", to: "approved", by: ["client"] },
  { from: ["delivered"], event: "review_period_ends", to: "approved", by: ["scheduler"] },
  { from: ["delivered"], event: "request_revision", to: "in_progress", by: ["client"] },
  { from: ["approved"], event: "release", to: "completed", by: ["system"] },
  { from: ["funded", "in_progress", "delivered"], event: "raise_dispute", to: "disputed", by: ["client", "freelancer"] },
  { from: ["disputed"], event: "rule_release", to: "completed", by: ["arbitrator"] },
  { from: ["disputed"], event: "rule_refund", to: "refunded", by: ["arbitrator"] },
  { from: ["disputed"], event: "rule_split", to: "resolved_split", by: ["arbitrator"] },
  { from: ["disputed"], event: "withdraw_dispute", to: "previous", by: ["client", "freelancer"] },
];

export class IllegalTransitionError extends Error {
  readonly code: "ILLEGAL_TRANSITION" | "FORBIDDEN_ACTOR";
  constructor(code: "ILLEGAL_TRANSITION" | "FORBIDDEN_ACTOR", message: string) {
    super(message);
    this.name = "IllegalTransitionError";
    this.code = code;
  }
}

function rulesFor(from: ContractState, event: EscrowEvent): Rule | undefined {
  return RULES.find((r) => r.event === event && r.from.includes(from));
}

export function nextState(
  from: ContractState,
  event: EscrowEvent,
  actor: ActorKind,
  previous?: ContractState,
): ContractState {
  const rule = rulesFor(from, event);
  if (!rule) {
    throw new IllegalTransitionError("ILLEGAL_TRANSITION", `A ${from.replace("_", " ")} contract cannot do "${event}".`);
  }
  if (!rule.by.includes(actor)) {
    throw new IllegalTransitionError("FORBIDDEN_ACTOR", `A ${actor} cannot do "${event}" on a ${from.replace("_", " ")} contract.`);
  }
  if (rule.to === "previous") {
    if (!previous) throw new IllegalTransitionError("ILLEGAL_TRANSITION", "The state before the dispute is unknown.");
    return previous;
  }
  return rule.to;
}

export function canTransition(from: ContractState, event: EscrowEvent, actor: ActorKind): boolean {
  const rule = rulesFor(from, event);
  return !!rule && rule.by.includes(actor);
}

export function isTerminal(state: ContractState): boolean {
  return TERMINAL_STATES.includes(state);
}

/** The happy path shown on the state rail in the UI. */
export const STATE_RAIL: readonly ContractState[] = [
  "draft",
  "proposed",
  "accepted",
  "funded",
  "in_progress",
  "delivered",
  "approved",
  "completed",
];

export const STATE_LABEL: Record<ContractState, string> = {
  draft: "Draft",
  proposed: "Proposed",
  accepted: "Accepted",
  funded: "Funded",
  in_progress: "In progress",
  delivered: "Delivered",
  approved: "Approved",
  completed: "Completed",
  disputed: "Disputed",
  refunded: "Refunded",
  resolved_split: "Resolved (split)",
  rejected: "Rejected",
  cancelled: "Cancelled",
  expired: "Expired",
};
