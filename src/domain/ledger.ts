import { assertMinor, type Minor } from "./money";
import { DomainError } from "./errors";
import type { Posting } from "./types";

/**
 * Double-entry ledger rules (FR-2.5, FR-2.6).
 * Every transaction is a list of postings that sum to zero. Wallet accounts can never go below zero.
 * This module builds and checks postings only. It never decides who is allowed to move money.
 */
export const FEES_ACCOUNT = "platform:fees";
export const GATEWAY_ACCOUNT = "gateway:simulated";

export const walletAvailable = (userId: string) => `wallet:${userId}:available`;
export const walletHeld = (userId: string) => `wallet:${userId}:held`;
export const isWalletAccount = (account: string) => account.startsWith("wallet:");

export function assertBalanced(postings: readonly Posting[]): void {
  if (postings.length < 2) throw new DomainError("VALIDATION", "A money movement needs at least two entries.");
  let sum = 0;
  for (const p of postings) {
    assertMinor(p.delta, "Ledger entry");
    if (p.delta === 0) throw new DomainError("VALIDATION", "A ledger entry cannot be zero.");
    sum += p.delta;
  }
  if (sum !== 0) throw new DomainError("VALIDATION", "Ledger entries must add up to zero.");
}

export const topUpPostings = (userId: string, amount: Minor): Posting[] => [
  { account: GATEWAY_ACCOUNT, delta: -amount },
  { account: walletAvailable(userId), delta: amount },
];

export const withdrawPostings = (userId: string, amount: Minor): Posting[] => [
  { account: walletAvailable(userId), delta: -amount },
  { account: GATEWAY_ACCOUNT, delta: amount },
];

export const fundPostings = (clientId: string, amount: Minor): Posting[] => [
  { account: walletAvailable(clientId), delta: -amount },
  { account: walletHeld(clientId), delta: amount },
];

export function releasePostings(clientId: string, freelancerId: string, amount: Minor, fee: Minor): Posting[] {
  const postings: Posting[] = [
    { account: walletHeld(clientId), delta: -amount },
    { account: walletAvailable(freelancerId), delta: amount - fee },
  ];
  if (fee > 0) postings.push({ account: FEES_ACCOUNT, delta: fee });
  return postings.filter((p) => p.delta !== 0);
}

export const refundPostings = (clientId: string, amount: Minor): Posting[] => [
  { account: walletHeld(clientId), delta: -amount },
  { account: walletAvailable(clientId), delta: amount },
];

/** Net effect of postings on each account, used by repositories to check wallet balances before writing. */
export function netByAccount(postings: readonly Posting[]): Map<string, Minor> {
  const net = new Map<string, Minor>();
  for (const p of postings) net.set(p.account, (net.get(p.account) ?? 0) + p.delta);
  return net;
}
