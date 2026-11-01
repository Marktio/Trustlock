import { createHash } from "node:crypto";
import type { AuditFields, StoredAudit } from "./types";

/**
 * Hash-chained audit log (FR-8.2, FR-8.4).
 * hash = SHA-256(previous hash + payload text). The payload is stored as the exact text that was hashed,
 * so verification never depends on re-serialising JSON the same way.
 */
export const GENESIS_HASH = "0".repeat(64);

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function hashEntry(prevHash: string, payload: string): string {
  return sha256Hex(prevHash + payload);
}

const SECRET_KEYS = /password|token|secret|authorization|api[_-]?key/i;

function redact(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redact);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEYS.test(k) ? "[redacted]" : redact(v)]),
  );
}

export function buildPayload(fields: AuditFields, at: Date): string {
  return JSON.stringify({
    v: 1,
    at: at.toISOString(),
    actorId: fields.actorId,
    actorRole: fields.actorRole,
    action: fields.action,
    targetType: fields.targetType,
    targetId: fields.targetId,
    result: fields.result,
    detail: fields.detail ?? null,
    before: redact(fields.before ?? null),
    after: redact(fields.after ?? null),
  });
}

export interface ParsedAudit extends AuditFields {
  seq: number;
  at: string;
  hash: string;
}

export function parseAudit(entry: StoredAudit): ParsedAudit {
  const p = JSON.parse(entry.payload) as AuditFields & { at: string };
  return { ...p, seq: entry.seq, hash: entry.hash };
}

export type ChainResult =
  | { ok: true; count: number; head: string }
  | { ok: false; brokenAt: number; reason: string; expected?: string; actual?: string };

/** Recompute every link. Reports the first broken entry, or a missing tail compared with the stored head. */
export function verifyChain(entries: readonly StoredAudit[], head: { count: number; hash: string }): ChainResult {
  let prev = GENESIS_HASH;
  let expectedSeq = 1;
  for (const entry of entries) {
    if (entry.seq !== expectedSeq) {
      return { ok: false, brokenAt: expectedSeq, reason: "An entry is missing from the sequence." };
    }
    if (entry.prevHash !== prev) {
      return { ok: false, brokenAt: entry.seq, reason: "This entry does not link to the one before it.", expected: prev, actual: entry.prevHash };
    }
    const recomputed = hashEntry(prev, entry.payload);
    if (recomputed !== entry.hash) {
      return { ok: false, brokenAt: entry.seq, reason: "This entry's content no longer matches its fingerprint.", expected: recomputed, actual: entry.hash };
    }
    prev = entry.hash;
    expectedSeq += 1;
  }
  if (entries.length !== head.count || prev !== head.hash) {
    return { ok: false, brokenAt: entries.length + 1, reason: "Entries at the end of the log are missing." };
  }
  return { ok: true, count: entries.length, head: prev };
}
