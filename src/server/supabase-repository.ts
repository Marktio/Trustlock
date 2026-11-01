import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GENESIS_HASH, buildPayload } from "@/domain/audit";
import { ConflictError, DomainError, InsufficientFundsError } from "@/domain/errors";
import { walletAvailable, walletHeld } from "@/domain/ledger";
import type { CommitRequest, CommitResult, EscrowRepository } from "@/domain/repository";
import type { ContractState } from "@/domain/states";
import type { Balances, Clock, Contract, LedgerRecord, StoredAudit, User } from "@/domain/types";

/** The exact JSON the SQL function public.commit_escrow(req) expects. */
export interface CommitPayload {
  idempotencyKey: string | null;
  createContract: Record<string, unknown> | null;
  contractId: string | null;
  expectedVersion: number | null;
  patch: Record<string, unknown> | null;
  postings: { account: string; delta: number }[];
  memo: string;
  audit: string[];
}

/**
 * Turns a domain commit into the SQL function's request.
 * Two things must happen here, before the database sees anything:
 *  - a new contract gets its UUID now, so audit entries filed under "new" can be rewritten to the real id;
 *  - audit payloads are built here, because the hash chain is computed over their exact text.
 */
export function buildCommitPayload(req: CommitRequest, clock: Clock, newId: () => string = randomUUID): { payload: CommitPayload; contractId: string | null } {
  const createdId = req.createContract ? newId() : null;
  const at = clock.now();
  const audit = req.audit.map((raw) => {
    const fields = createdId && raw.targetType === "contract" && raw.targetId === "new" ? { ...raw, targetId: createdId } : raw;
    return buildPayload(fields, at);
  });
  const c = req.createContract;
  return {
    contractId: createdId ?? req.contractId ?? null,
    payload: {
      idempotencyKey: req.idempotencyKey ?? null,
      createContract: c && createdId ? { ...c, id: createdId } : null,
      contractId: req.contractId ?? null,
      expectedVersion: req.expectedVersion ?? null,
      patch: req.patch ? { ...req.patch } : null,
      postings: (req.postings ?? []).map((p) => ({ account: p.account, delta: p.delta })),
      memo: req.memo ?? "",
      audit,
    },
  };
}

type Row = Record<string, unknown>;
const PAGE = 1000;

/** PostgREST returns "2026-10-28T07:52:10.123456+00:00". The rest of the app compares ISO strings ending in Z, so normalise here. */
const iso = (v: unknown): string | null => (v == null ? null : new Date(v as string).toISOString());

function toContract(r: Row): Contract {
  return {
    id: r.id as string,
    ref: r.ref as string,
    title: r.title as string,
    description: r.description as string,
    clientId: r.client_id as string,
    freelancerId: r.freelancer_id as string,
    amount: Number(r.amount),
    feeBps: Number(r.fee_bps),
    state: r.state as ContractState,
    version: Number(r.version),
    milestones: r.milestones as Contract["milestones"],
    reviewPeriodDays: Number(r.review_period_days),
    revisionLimit: Number(r.revision_limit),
    revisionsUsed: Number(r.revisions_used),
    expiresAt: iso(r.expires_at),
    deliveredAt: iso(r.delivered_at),
    reviewEndsAt: iso(r.review_ends_at),
    deliverable: (r.deliverable as Contract["deliverable"]) ?? null,
    revisionReason: (r.revision_reason as string | null) ?? null,
    createdAt: iso(r.created_at) as string,
    updatedAt: iso(r.updated_at) as string,
  };
}

function toLedger(r: Row): LedgerRecord {
  return {
    txId: r.tx_id as string,
    account: r.account as string,
    delta: Number(r.delta),
    memo: (r.memo as string) ?? "",
    contractId: (r.contract_id as string | null) ?? null,
    createdAt: iso(r.created_at) as string,
  };
}

/** Maps what the SQL function raises onto the errors the service already understands. */
function mapError(err: { message?: string; code?: string }): Error {
  const msg = err.message ?? "";
  if (msg.includes("CONFLICT")) return new ConflictError();
  if (msg.includes("INSUFFICIENT_FUNDS")) return new InsufficientFundsError();
  if (msg.includes("NOT_FOUND")) return new DomainError("NOT_FOUND", "We could not find that contract.");
  return new Error(`Database error: ${msg || err.code || "unknown"}`);
}

/**
 * Postgres (Supabase) implementation of EscrowRepository. Server-side only: it uses the service role key,
 * which bypasses Row Level Security. Every write goes through the single SQL function, so it is atomic.
 */
export class SupabaseRepository implements EscrowRepository {
  constructor(
    private readonly db: SupabaseClient,
    private readonly clock: Clock,
  ) {}

  private fail(label: string, error: { message?: string; code?: string } | null): never {
    throw new Error(`Database error while ${label}: ${error?.message ?? error?.code ?? "unknown"}`);
  }

  /** Reads every row of a query in pages, because the API caps one response at 1000 rows. */
  private async all(label: string, build: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { message?: string } | null }>): Promise<Row[]> {
    const out: Row[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await build(from, from + PAGE - 1);
      if (error) this.fail(label, error);
      out.push(...(data ?? []));
      if (!data || data.length < PAGE) return out;
    }
  }

  async getUserById(id: string): Promise<User | null> {
    const { data, error } = await this.db.from("profiles").select("*").eq("id", id).maybeSingle();
    if (error) this.fail("reading a user", error);
    return data ? { id: data.id, name: data.name, email: data.email, role: data.role } : null;
  }
  async getUserByEmail(email: string): Promise<User | null> {
    const { data, error } = await this.db.from("profiles").select("*").eq("email", email.trim().toLowerCase()).maybeSingle();
    if (error) this.fail("reading a user", error);
    return data ? { id: data.id, name: data.name, email: data.email, role: data.role } : null;
  }
  async upsertUser(user: User): Promise<void> {
    const { error } = await this.db.from("profiles").upsert({ id: user.id, name: user.name, email: user.email.trim().toLowerCase(), role: user.role }, { onConflict: "id" });
    if (error) this.fail("saving a user", error);
  }

  async listUsers(): Promise<User[]> {
    const rows = await this.all("listing users", (a, b) => this.db.from("profiles").select("*").order("created_at").order("id").range(a, b));
    return rows.map((r) => ({ id: r.id as string, name: r.name as string, email: r.email as string, role: r.role as User["role"] }));
  }

  async getContract(id: string): Promise<Contract | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null; // not a UUID: cannot exist, and Postgres would reject it
    const { data, error } = await this.db.from("contracts").select("*").eq("id", id).maybeSingle();
    if (error) this.fail("reading a contract", error);
    return data ? toContract(data) : null;
  }
  async listContractsForUser(userId: string): Promise<Contract[]> {
    const side = async (column: "client_id" | "freelancer_id") =>
      this.all("listing contracts", (a, b) => this.db.from("contracts").select("*").eq(column, userId).order("created_at", { ascending: false }).order("id").range(a, b));
    const [asClient, asFreelancer] = await Promise.all([side("client_id"), side("freelancer_id")]);
    const byId = new Map<string, Contract>();
    for (const r of [...asClient, ...asFreelancer]) byId.set(r.id as string, toContract(r));
    return [...byId.values()].sort((x, y) => y.createdAt.localeCompare(x.createdAt));
  }
  async listAllContracts(): Promise<Contract[]> {
    const rows = await this.all("listing all contracts", (a, b) => this.db.from("contracts").select("*").order("created_at").order("id").range(a, b));
    return rows.map(toContract);
  }
  async listContractsByState(state: ContractState): Promise<Contract[]> {
    const rows = await this.all("listing contracts by state", (a, b) => this.db.from("contracts").select("*").eq("state", state).order("created_at").order("id").range(a, b));
    return rows.map(toContract);
  }

  private async balanceOf(account: string): Promise<number> {
    const rows = await this.all("reading a balance", (a, b) => this.db.from("ledger_entries").select("delta").eq("account", account).order("id").range(a, b));
    return rows.reduce((s, r) => s + Number(r.delta), 0);
  }
  async getBalances(userId: string): Promise<Balances> {
    const [available, held] = await Promise.all([this.balanceOf(walletAvailable(userId)), this.balanceOf(walletHeld(userId))]);
    return { available, held };
  }
  async listLedgerForUser(userId: string): Promise<LedgerRecord[]> {
    const rows = await this.all("reading the ledger", (a, b) =>
      this.db.from("ledger_entries").select("*").in("account", [walletAvailable(userId), walletHeld(userId)]).order("id").range(a, b),
    );
    return rows.map(toLedger);
  }
  async sumTopUpsSince(userId: string, sinceIso: string): Promise<number> {
    const rows = await this.all("summing top-ups", (a, b) =>
      this.db.from("ledger_entries").select("delta").eq("account", walletAvailable(userId)).like("memo", "Top-up%").gte("created_at", sinceIso).order("id").range(a, b),
    );
    return rows.reduce((s, r) => s + Number(r.delta), 0);
  }
  async listAllLedger(): Promise<LedgerRecord[]> {
    const rows = await this.all("reading the ledger", (a, b) => this.db.from("ledger_entries").select("*").order("id").range(a, b));
    return rows.map(toLedger);
  }

  async findIdempotent(key: string) {
    const { data, error } = await this.db.from("idempotency_keys").select("contract_id").eq("key", key).maybeSingle();
    if (error) this.fail("checking an idempotency key", error);
    return data ? { contractId: (data.contract_id as string | null) ?? null } : null;
  }

  async commit(req: CommitRequest): Promise<CommitResult> {
    const { payload, contractId } = buildCommitPayload(req, this.clock);
    const { data, error } = await this.db.rpc("commit_escrow", { req: payload });
    if (error) throw mapError(error);
    const id = (data as { contractId: string | null } | null)?.contractId ?? contractId;
    const replayed = Boolean((data as { replayed?: boolean } | null)?.replayed);
    return { replayed, contract: id ? await this.getContract(id) : null };
  }

  async listAudit(): Promise<StoredAudit[]> {
    const rows = await this.all("reading the audit log", (a, b) => this.db.from("audit_log").select("seq,payload,prev_hash,hash").order("seq").range(a, b));
    return rows.map((r) => ({ seq: Number(r.seq), payload: r.payload as string, prevHash: r.prev_hash as string, hash: r.hash as string }));
  }
  async getAuditHead() {
    const { data, error } = await this.db.from("audit_head").select("count,hash").eq("id", 1).maybeSingle();
    if (error) this.fail("reading the audit head", error);
    return data ? { count: Number(data.count), hash: data.hash as string } : { count: 0, hash: GENESIS_HASH };
  }
}
