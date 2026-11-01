import { randomUUID } from "node:crypto";
import { GENESIS_HASH, buildPayload, hashEntry } from "@/domain/audit";
import { ConflictError, DomainError, InsufficientFundsError } from "@/domain/errors";
import { assertBalanced, isWalletAccount, netByAccount, walletAvailable, walletHeld } from "@/domain/ledger";
import type { AuditHead, CommitRequest, CommitResult, EscrowRepository } from "@/domain/repository";
import type { ContractState } from "@/domain/states";
import type { Balances, Clock, Contract, LedgerRecord, Posting, StoredAudit, User } from "@/domain/types";

/** In-memory repository for unit tests and demo mode. A single commit() call runs without awaiting, so it is atomic. */
export class MemoryRepository implements EscrowRepository {
  private users = new Map<string, User>();
  private contracts = new Map<string, Contract>();
  private ledger: LedgerRecord[] = [];
  private audit: StoredAudit[] = [];
  private head: AuditHead = { count: 0, hash: GENESIS_HASH };
  private idempotency = new Map<string, string | null>();
  private refCounter = 0;

  constructor(private readonly clock: Clock) {}

  async getUserById(id: string) {
    return this.users.get(id) ?? null;
  }
  async getUserByEmail(email: string) {
    const needle = email.trim().toLowerCase();
    return [...this.users.values()].find((u) => u.email.toLowerCase() === needle) ?? null;
  }
  async upsertUser(user: User) {
    this.users.set(user.id, { ...user });
  }

  async listUsers() {
    return [...this.users.values()].map((u) => ({ ...u }));
  }

  async getContract(id: string) {
    const c = this.contracts.get(id);
    return c ? structuredClone(c) : null;
  }
  async listContractsForUser(userId: string) {
    return [...this.contracts.values()]
      .filter((c) => c.clientId === userId || c.freelancerId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((c) => structuredClone(c));
  }
  async listAllContracts() {
    return [...this.contracts.values()].map((c) => structuredClone(c));
  }
  async listContractsByState(state: ContractState) {
    return [...this.contracts.values()].filter((c) => c.state === state).map((c) => structuredClone(c));
  }

  private balanceOf(account: string): number {
    return this.ledger.reduce((sum, e) => (e.account === account ? sum + e.delta : sum), 0);
  }

  async getBalances(userId: string): Promise<Balances> {
    return { available: this.balanceOf(walletAvailable(userId)), held: this.balanceOf(walletHeld(userId)) };
  }
  async listLedgerForUser(userId: string) {
    const mine = new Set([walletAvailable(userId), walletHeld(userId)]);
    return this.ledger.filter((e) => mine.has(e.account)).map((e) => ({ ...e }));
  }
  async sumTopUpsSince(userId: string, sinceIso: string) {
    return this.ledger
      .filter((e) => e.account === walletAvailable(userId) && e.memo.startsWith("Top-up") && e.createdAt >= sinceIso)
      .reduce((s, e) => s + e.delta, 0);
  }
  async findIdempotent(key: string) {
    return this.idempotency.has(key) ? { contractId: this.idempotency.get(key) ?? null } : null;
  }
  async listAllLedger() {
    return this.ledger.map((e) => ({ ...e }));
  }

  async commit(req: CommitRequest): Promise<CommitResult> {
    if (req.idempotencyKey && this.idempotency.has(req.idempotencyKey)) {
      const id = this.idempotency.get(req.idempotencyKey);
      return { replayed: true, contract: id ? structuredClone(this.contracts.get(id) ?? null) : null };
    }
    const now = this.clock.now().toISOString();

    // 1. Validate everything first, so a failure leaves nothing half-written.
    const next = this.nextContract(req, now);
    const postings = req.postings ?? [];
    this.checkPostings(postings);

    // 2. Apply.
    if (next) this.contracts.set(next.id, next);
    this.applyPostings(postings, req.memo ?? "", next?.id ?? null, now);
    this.appendAudit(req, next);
    if (req.idempotencyKey) this.idempotency.set(req.idempotencyKey, next?.id ?? null);

    return { replayed: false, contract: next ? structuredClone(next) : null };
  }

  /** The contract as it will be after this commit: a new one, a patched one, or none for audit-only commits. */
  private nextContract(req: CommitRequest, now: string): Contract | null {
    if (req.createContract) {
      this.refCounter += 1;
      return {
        ...structuredClone(req.createContract),
        id: randomUUID(),
        ref: `TL-${this.clock.now().getUTCFullYear()}-${String(this.refCounter).padStart(4, "0")}`,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
    }
    if (!req.contractId) return null;
    const current = this.contracts.get(req.contractId);
    if (!current) throw new DomainError("NOT_FOUND", "We could not find that contract.");
    if (req.expectedVersion !== current.version) throw new ConflictError();
    return { ...structuredClone(current), ...structuredClone(req.patch ?? {}), version: current.version + 1, updatedAt: now };
  }

  private checkPostings(postings: readonly Posting[]) {
    if (postings.length === 0) return;
    assertBalanced(postings);
    for (const [account, delta] of netByAccount(postings)) {
      if (isWalletAccount(account) && this.balanceOf(account) + delta < 0) throw new InsufficientFundsError();
    }
  }

  private applyPostings(postings: readonly Posting[], memo: string, contractId: string | null, now: string) {
    if (postings.length === 0) return;
    const txId = randomUUID();
    for (const p of postings) this.ledger.push({ txId, account: p.account, delta: p.delta, memo, contractId, createdAt: now });
  }

  private appendAudit(req: CommitRequest, next: Contract | null) {
    for (const raw of req.audit) {
      // Entries written while creating a contract are filed under "new" because the id does not exist yet.
      const fields = next && req.createContract && raw.targetType === "contract" && raw.targetId === "new" ? { ...raw, targetId: next.id } : raw;
      const payload = buildPayload(fields, this.clock.now());
      const entry: StoredAudit = { seq: this.head.count + 1, payload, prevHash: this.head.hash, hash: hashEntry(this.head.hash, payload) };
      this.audit.push(entry);
      this.head = { count: entry.seq, hash: entry.hash };
    }
  }

  async listAudit() {
    return this.audit.map((e) => ({ ...e }));
  }
  async getAuditHead() {
    return { ...this.head };
  }

  /** Test helper: change a stored audit payload without touching its hash, to prove tampering is detected. */
  tamperAudit(seq: number, payload: string) {
    const entry = this.audit.find((e) => e.seq === seq);
    if (entry) entry.payload = payload;
  }
  /** Test helper: remove an audit entry, to prove deletion is detected. */
  deleteAudit(seq: number) {
    this.audit = this.audit.filter((e) => e.seq !== seq);
  }
}
