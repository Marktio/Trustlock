import type { ContractState } from "@/domain/states";
import type { T } from "@/i18n/core";

const SW_MONTHS = ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ago", "Sep", "Okt", "Nov", "Des"];
const swDay = (d: Date) => `${d.getUTCDate()} ${SW_MONTHS[d.getUTCMonth()]}`;
const pad = (n: number) => String(n).padStart(2, "0");

const dateTime = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC", hour12: false });
const dateOnly = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** All times are shown in UTC and labelled as such (FR-3.9). */
export const fmtDateTime = (iso: string, t?: T) => {
  const d = new Date(iso);
  return t?.lang === "sw" ? `${swDay(d)}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC` : `${dateTime.format(d)} UTC`;
};
export const fmtDate = (iso: string, t?: T) => (t?.lang === "sw" ? swDay(new Date(iso)) : dateOnly.format(new Date(iso)));
const units = (t: T | undefined) => (t?.lang === "sw" ? { d: "siku", h: "saa", m: "dak" } : { d: "d", h: "h", m: "m" });

export function timeLeft(iso: string, t?: T, now = new Date()): string {
  const u = units(t);
  const ms = new Date(iso).getTime() - now.getTime();
  if (ms <= 0) return t ? t("Ended") : "Ended";
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return days > 0 ? `${days}${u.d} ${hours}${u.h}` : `${hours}${u.h} ${minutes}${u.m}`;
}

export type Tone = "grey" | "blue" | "amber" | "green" | "red";

export const STATE_TONE: Record<ContractState, Tone> = {
  draft: "grey",
  proposed: "grey",
  accepted: "blue",
  funded: "amber",
  in_progress: "blue",
  delivered: "blue",
  approved: "green",
  completed: "green",
  disputed: "red",
  refunded: "amber",
  resolved_split: "amber",
  rejected: "red",
  cancelled: "grey",
  expired: "grey",
};

export const ACTION_LABEL: Record<string, string> = {
  "contract.created": "Contract created",
  "contract.proposed": "Proposal sent",
  "contract.accept": "Contract accepted",
  "contract.counter_propose": "Counter-proposal sent",
  "contract.accept_counter": "Counter-proposal accepted",
  "contract.decline_counter": "Counter-proposal declined",
  "evidence.submitted": "Evidence submitted",
  "dispute.info_requested": "Arbitrator asked for more information",
  "dispute.assigned": "Arbitrator assigned",
  "contract.reject": "Contract rejected",
  "contract.cancel": "Contract cancelled",
  "contract.cancel_requested": "Asked to cancel the funded contract",
  "contract.cancel_declined": "Request to cancel turned down",
  "contract.mutual_cancel": "Cancelled by agreement, money returned",
  "dispute.withdraw_requested": "Asked to withdraw the dispute",
  "contract.fund": "Escrow funded",
  "contract.start_work": "Work started",
  "contract.deliver": "Work delivered",
  "contract.request_revision": "Revision requested",
  "contract.approve": "Client approved",
  "contract.review_period_ends": "Review period ended, auto-approved",
  "contract.expire_proposal": "Proposal expired",
  "contract.expire_unfunded": "Funding deadline passed",
  "escrow.released": "Payment released",
  "contract.raise_dispute": "Dispute raised",
  "contract.withdraw_dispute": "Dispute withdrawn",
  "contract.rule_release": "Ruling: paid to freelancer",
  "contract.rule_refund": "Ruling: refunded to client",
  "contract.rule_split": "Ruling: split",
};

/** Long countdown for the review screen, e.g. "2d 14h 08m". Computed on the server from the server clock. */
export function timeLeftLong(iso: string, t?: T, now = new Date()): string {
  const u = units(t);
  const ms = new Date(iso).getTime() - now.getTime();
  if (ms <= 0) return t ? t("Ended") : "Ended";
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, "0");
  return days > 0 ? `${days}${u.d} ${hours}${u.h} ${minutes}${u.m}` : `${hours}${u.h} ${minutes}${u.m}`;
}
