import { cookies, headers } from "next/headers";
import { DEFAULT_CURRENCY } from "@/domain/money";

/**
 * Which country (and so which currency label) to show amounts in.
 * Order: the visitor's own choice (cookie), then the country the host reports, then the browser language, then Kenya.
 * Display only. Amounts are practice credits and are never converted.
 */
export const REGION_COOKIE = "tl_region";
export const DEFAULT_COUNTRY = "KE";

const EUR = ["DE", "FR", "ES", "IT", "NL", "BE", "AT", "IE", "PT", "FI", "GR", "LU", "SK", "SI", "EE", "LV", "LT", "MT", "CY", "HR"];
const CURRENCY_BY_COUNTRY: Record<string, string> = {
  KE: "KES", US: "USD", GB: "GBP", JP: "JPY", NG: "NGN", ZA: "ZAR", UG: "UGX", TZ: "TZS", RW: "RWF", ET: "ETB", GH: "GHS", EG: "EGP",
  MA: "MAD", IN: "INR", PK: "PKR", BD: "BDT", CN: "CNY", KR: "KRW", ID: "IDR", PH: "PHP", VN: "VND", TH: "THB", MY: "MYR", SG: "SGD",
  AE: "AED", SA: "SAR", IL: "ILS", TR: "TRY", CA: "CAD", MX: "MXN", BR: "BRL", AR: "ARS", CL: "CLP", CO: "COP", AU: "AUD", NZ: "NZD",
  CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON", UA: "UAH", RU: "RUB",
  ...Object.fromEntries(EUR.map((c) => [c, "EUR"])),
};

/** Countries offered in the picker. A detected country outside this list is added to it automatically. */
export const PICKER_COUNTRIES = ["KE", "UG", "TZ", "RW", "NG", "GH", "ZA", "EG", "US", "CA", "GB", "DE", "FR", "JP", "CN", "IN", "AE", "AU", "BR", "MX"];

export const currencyForCountry = (country: string): string => CURRENCY_BY_COUNTRY[country.toUpperCase()] ?? "USD";

export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export interface Region {
  country: string;
  currency: string;
  source: "choice" | "host" | "language" | "default";
}

const valid = (c: string | null | undefined): c is string => !!c && /^[A-Za-z]{2}$/.test(c) && c.toUpperCase() !== "XX" && c.toUpperCase() !== "T1";

export async function getRegion(): Promise<Region> {
  const chosen = (await cookies()).get(REGION_COOKIE)?.value;
  if (valid(chosen)) return { country: chosen.toUpperCase(), currency: currencyForCountry(chosen), source: "choice" };

  const h = await headers();
  for (const name of ["x-vercel-ip-country", "cf-ipcountry", "cloudfront-viewer-country", "x-country-code"]) {
    const v = h.get(name);
    if (valid(v)) return { country: v.toUpperCase(), currency: currencyForCountry(v), source: "host" };
  }
  const lang = h.get("accept-language") ?? "";
  for (const part of lang.split(",")) {
    const m = /^[a-z]{2,3}-([A-Za-z]{2})\b/i.exec(part.trim());
    if (m) return { country: m[1].toUpperCase(), currency: currencyForCountry(m[1]), source: "language" };
  }
  return { country: DEFAULT_COUNTRY, currency: DEFAULT_CURRENCY, source: "default" };
}
