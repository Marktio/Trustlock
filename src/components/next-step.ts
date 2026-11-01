import type { Contract } from "@/domain/types";
import { fmtDate, timeLeft } from "./format";

type Kind = "client" | "freelancer";

/** The same sentence for both people. */
const SAME: Partial<Record<Contract["state"], string>> = {
  approved: "Releasing payment",
  refunded: "Funds returned to the client",
  disputed: "Waiting for an arbitrator",
  resolved_split: "Split decided by an arbitrator",
  rejected: "Rejected",
  cancelled: "Cancelled",
  expired: "Expired",
};

/** One sentence for the client and one for the freelancer; `who` is the other person's name. */
const BY_KIND: Partial<Record<Contract["state"], (who: string) => { client: string; freelancer: string }>> = {
  accepted: (who) => ({ client: "Fund the escrow to start the work", freelancer: `Waiting for ${who} to fund` }),
  funded: () => ({ client: "Funds locked. Waiting for work to start", freelancer: "Start work" }),
  in_progress: () => ({ client: "Work in progress", freelancer: "Deliver your work" }),
};

function proposedStep(kind: Kind, who: string, awaiting: Kind): string {
  const client = kind === "client";
  if (awaiting === "client") return client ? `${who} sent new terms. Accept or decline them` : `Waiting for ${who} to answer your counter-proposal`;
  return client ? `Waiting for ${who} to reply` : "Accept, counter or reject this proposal";
}

function deliveredStep(c: Contract, kind: Kind): string {
  const left = c.reviewEndsAt ? ` Auto-approves in ${timeLeft(c.reviewEndsAt)}` : "";
  if (kind === "client") return c.reviewEndsAt ? `Review now.${left}` : "Review the delivery";
  return c.reviewEndsAt ? `Waiting for review.${left}` : "Waiting for review";
}

/** One plain sentence saying what happens next for this person (NFR-5.2). */
export function nextStep(c: Contract, kind: Kind, counterpart: string, awaiting: Kind = "freelancer"): string {
  if (c.state === "proposed") return proposedStep(kind, counterpart, awaiting);
  if (c.state === "delivered") return deliveredStep(c, kind);
  if (c.state === "completed") return `Paid ${fmtDate(c.updatedAt)}`;
  const pair = BY_KIND[c.state]?.(counterpart);
  return pair ? pair[kind] : (SAME[c.state] ?? "");
}

/** Does this contract need the viewer to do something right now? */
export function needsAction(c: Contract, kind: "client" | "freelancer", awaiting: "client" | "freelancer" = "freelancer"): boolean {
  if (kind === "client") return c.state === "accepted" || c.state === "delivered" || (c.state === "proposed" && awaiting === "client");
  return (c.state === "proposed" && awaiting === "freelancer") || c.state === "funded" || c.state === "in_progress";
}
