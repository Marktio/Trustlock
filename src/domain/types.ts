import type { Minor } from "./money";
import type { ContractState } from "./states";

export type Role = "client" | "freelancer" | "arbitrator" | "admin" | "auditor";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Display currency for this request (from the viewer's region). Never stored. */
  currency?: string;
}

export interface Actor {
  id: string;
  role: Role;
  /** Display currency, so messages the service writes use the viewer's unit. */
  currency?: string;
}

export interface Milestone {
  title: string;
  dueDate: string;
  amount: Minor;
}

export interface Deliverable {
  name: string;
  sizeBytes: number;
  sha256: string;
  note: string | null;
}

export interface Contract {
  id: string;
  ref: string;
  title: string;
  description: string;
  clientId: string;
  freelancerId: string;
  amount: Minor;
  feeBps: number;
  state: ContractState;
  /** Incremented on every change. Writers pass the version they read, so a stale write fails (NFR-2.4). */
  version: number;
  milestones: Milestone[];
  reviewPeriodDays: number;
  revisionLimit: number;
  revisionsUsed: number;
  /** Proposal expiry while proposed, funding deadline while accepted. */
  expiresAt: string | null;
  deliveredAt: string | null;
  reviewEndsAt: string | null;
  deliverable: Deliverable | null;
  revisionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NewContract = Omit<Contract, "id" | "ref" | "version" | "createdAt" | "updatedAt">;
export type ContractPatch = Partial<
  Pick<
    Contract,
    "state" | "revisionsUsed" | "expiresAt" | "deliveredAt" | "reviewEndsAt" | "deliverable" | "revisionReason" | "amount" | "milestones" | "reviewPeriodDays" | "revisionLimit"
  >
>;

export interface Posting {
  account: string;
  delta: Minor;
}

export interface LedgerRecord {
  txId: string;
  account: string;
  delta: Minor;
  memo: string;
  contractId: string | null;
  createdAt: string;
}

export interface AuditFields {
  actorId: string | null;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  result: "ok" | "rejected";
  detail?: string;
  before?: unknown;
  after?: unknown;
}

/** What is stored: the canonical JSON text and the hashes. Display fields are always parsed from the payload. */
export interface StoredAudit {
  seq: number;
  payload: string;
  prevHash: string;
  hash: string;
}

export interface Clock {
  now(): Date;
}

export interface Balances {
  available: Minor;
  held: Minor;
}
