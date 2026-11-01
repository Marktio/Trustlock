import type {
  AuditFields,
  Balances,
  Contract,
  ContractPatch,
  LedgerRecord,
  NewContract,
  Posting,
  StoredAudit,
  User,
} from "./types";
import type { ContractState } from "./states";

/**
 * One atomic write. Everything in it succeeds together or nothing changes (FR-4.1, FR-5.8, FR-8.5, NFR-2.2):
 * the contract update, the ledger postings, the idempotency key and the audit entries.
 * The Postgres implementation is a single SQL function; the in-memory one is used for tests and demo mode.
 */
export interface CommitRequest {
  idempotencyKey?: string;
  createContract?: NewContract;
  contractId?: string;
  expectedVersion?: number;
  patch?: ContractPatch;
  postings?: Posting[];
  memo?: string;
  audit: AuditFields[];
}

export interface CommitResult {
  /** True when the idempotency key was already used: nothing was changed and the original contract is returned. */
  replayed: boolean;
  contract: Contract | null;
}

export interface AuditHead {
  count: number;
  hash: string;
}

export interface EscrowRepository {
  getUserById(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  upsertUser(user: User): Promise<void>;
  listUsers(): Promise<User[]>;

  getContract(id: string): Promise<Contract | null>;
  listContractsForUser(userId: string): Promise<Contract[]>;
  listContractsByState(state: ContractState): Promise<Contract[]>;
  /** Every contract, for the administrator's overview. Metadata only is shown there. */
  listAllContracts(): Promise<Contract[]>;

  getBalances(userId: string): Promise<Balances>;
  listLedgerForUser(userId: string): Promise<LedgerRecord[]>;
  /** Total of the user's top-ups since the given time, in minor units. */
  sumTopUpsSince(userId: string, sinceIso: string): Promise<number>;

  commit(request: CommitRequest): Promise<CommitResult>;
  /** Has this idempotency key already been used? Returns the contract it produced, if any. */
  findIdempotent(key: string): Promise<{ contractId: string | null } | null>;

  listAudit(): Promise<StoredAudit[]>;
  getAuditHead(): Promise<AuditHead>;
  /** Every ledger posting, for the reconciliation check (FR-9.7). */
  listAllLedger(): Promise<LedgerRecord[]>;
}
