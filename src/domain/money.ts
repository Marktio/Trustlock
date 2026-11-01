/**
 * Money is always an integer number of minor units (FR-2.1, NFR-2.1).
 * 100 minor units = 1 practice credit (the code and database call the unit "SC"). How a credit is labelled (KSh, $, ¥ ...) depends on the
 * viewer's region and is display only: nothing is converted. No floating point is used for arithmetic.
 */
export type Minor = number;

export const MINOR_PER_SC = 100;
/** Used when no region is known. Values are practice credits; no real money moves. */
export const DEFAULT_CURRENCY = "KES";

/** Short label for a currency code: "KSh", "$", "¥", "€", "CHF"... Falls back to the code itself. */
export function currencyLabel(code: string = DEFAULT_CURRENCY): string {
  if (code === "KES") return "KSh";
  try {
    const part = new Intl.NumberFormat("en", { style: "currency", currency: code, currencyDisplay: "narrowSymbol" })
      .formatToParts(0)
      .find((p) => p.type === "currency");
    return part?.value ?? code;
  } catch {
    return code;
  }
}

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

export function assertMinor(value: unknown, label = "Amount"): asserts value is Minor {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} must be a whole number of minor units.`);
  }
}

export function scToMinor(input: string | number): Minor {
  const text = String(input).trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    throw new MoneyError("Enter an amount like 15000 or 15000.50.");
  }
  const [whole, fraction = ""] = text.split(".");
  const minor = Number(whole) * MINOR_PER_SC + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(minor)) throw new MoneyError("That amount is too large.");
  return minor;
}

export function formatSC(minor: Minor, withUnit = true, currency: string = DEFAULT_CURRENCY): string {
  assertMinor(minor);
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / MINOR_PER_SC);
  const cents = abs % MINOR_PER_SC;
  const wholeText = new Intl.NumberFormat("en-US").format(whole);
  const body = cents === 0 ? wholeText : `${wholeText}.${String(cents).padStart(2, "0")}`;
  if (!withUnit) return `${sign}${body}`;
  const label = currencyLabel(currency);
  // Symbols hug the number ("$45,000"); letter labels get a space ("KSh 45,000").
  return /^[^\p{L}]{1,2}$/u.test(label) ? `${sign}${label}${body}` : `${sign}${label} ${body}`;
}

/** Platform fee in basis points (200 = 2%), rounded half up. Defined once, tested once. */
export function feeFor(amount: Minor, feeBps: number): Minor {
  assertMinor(amount);
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) {
    throw new MoneyError("Fee must be between 0 and 10000 basis points.");
  }
  return Math.floor((amount * feeBps + 5_000) / 10_000);
}

/** Split a held amount by a freelancer percentage (1 to 99). The two parts always sum to the total. */
export function splitAmount(total: Minor, freelancerPercent: number): { freelancer: Minor; client: Minor } {
  assertMinor(total);
  if (!Number.isInteger(freelancerPercent) || freelancerPercent <= 0 || freelancerPercent >= 100) {
    throw new MoneyError("A split must give the freelancer between 1% and 99%.");
  }
  const freelancer = Math.floor((total * freelancerPercent) / 100);
  return { freelancer, client: total - freelancer };
}
