import { describe, expect, it } from "vitest";
import { DomainError } from "./errors";
import { assertBalanced, fundPostings, netByAccount, refundPostings, releasePostings, topUpPostings, withdrawPostings } from "./ledger";

const sum = (p: { delta: number }[]) => p.reduce((s, x) => s + x.delta, 0);

describe("ledger postings", () => {
  it("every builder produces postings that add up to zero [FR-2.5, NFR-2.3]", () => {
    for (const postings of [
      topUpPostings("c", 1000),
      withdrawPostings("f", 500),
      fundPostings("c", 4_500_000),
      releasePostings("c", "f", 4_500_000, 90_000),
      releasePostings("c", "f", 100, 0),
      refundPostings("c", 4_500_000),
    ]) {
      expect(sum(postings)).toBe(0);
      expect(() => assertBalanced(postings)).not.toThrow();
    }
  });

  it("pays the freelancer the amount minus the fee and credits the fee account [FR-5.8]", () => {
    const net = netByAccount(releasePostings("c", "f", 1_850_000, 37_000));
    expect(net.get("wallet:c:held")).toBe(-1_850_000);
    expect(net.get("wallet:f:available")).toBe(1_813_000);
    expect(net.get("platform:fees")).toBe(37_000);
  });

  it("rejects unbalanced, single-entry, zero and fractional postings [FR-2.5, FR-2.6, NFR-2.1]", () => {
    expect(() => assertBalanced([{ account: "a", delta: 5 }, { account: "b", delta: -4 }])).toThrow(DomainError);
    expect(() => assertBalanced([{ account: "a", delta: 0 }, { account: "b", delta: 0 }])).toThrow(DomainError);
    expect(() => assertBalanced([{ account: "a", delta: 5 }])).toThrow(DomainError);
    expect(() => assertBalanced([{ account: "a", delta: 0.5 }, { account: "b", delta: -0.5 }])).toThrow();
  });
});
