import { describe, expect, it } from "vitest";
import { MoneyError, feeFor, formatSC, scToMinor, splitAmount } from "./money";

describe("money", () => {
  it("parses credits into integer minor units [NFR-2.1]", () => {
    expect(scToMinor("45000")).toBe(4_500_000);
    expect(scToMinor("1,250.5")).toBe(125_050);
    expect(scToMinor("0.07")).toBe(7);
  });

  it("rejects amounts that are not plain numbers with at most two decimals [NFR-2.1, NFR-1.3]", () => {
    for (const bad of ["", "abc", "-5", "1.234", "1e3", "1.5.2"]) expect(() => scToMinor(bad)).toThrow(MoneyError);
  });

  it("formats with grouping and drops zero decimals [NFR-2.1]", () => {
    expect(formatSC(4_500_000)).toBe("KSh 45,000");
    expect(formatSC(125_050)).toBe("KSh 1,250.50");
    expect(formatSC(-300, false)).toBe("-3");
  });

  it("refuses floating point amounts [NFR-2.1]", () => {
    expect(() => formatSC(10.5)).toThrow(MoneyError);
  });

  it("computes a 2% fee and rounds half up [NFR-2.1, FR-4.6]", () => {
    expect(feeFor(4_500_000, 200)).toBe(90_000);
    expect(feeFor(25, 200)).toBe(1); // 0.5 rounds up
    expect(feeFor(24, 200)).toBe(0);
    expect(feeFor(1_000, 0)).toBe(0);
  });

  it("splits an odd amount without losing a unit [NFR-2.1, FR-6.6]", () => {
    const { freelancer, client } = splitAmount(101, 50);
    expect(freelancer + client).toBe(101);
    expect(freelancer).toBe(50);
    expect(client).toBe(51);
  });

  it("only allows splits between 1% and 99% [FR-6.6]", () => {
    expect(() => splitAmount(1000, 0)).toThrow(MoneyError);
    expect(() => splitAmount(1000, 100)).toThrow(MoneyError);
  });
});
