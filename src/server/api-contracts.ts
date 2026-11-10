import { z } from "zod";
import type { ContractView } from "@/domain/escrow-service";
import type { Actor, Contract, User } from "@/domain/types";
import { MINOR_PER_SC } from "@/domain/money";
import { ApiError, readJson, idempotencyKey, type ApiContext } from "./api-v1";
import { EXTERNAL_ID, externalIdOf, type WebhookDelivery, type WebhookEndpoint } from "./platform";

/** Amounts in the API are integers in minor units (100 = 1 credit), never decimals, so nothing is lost to rounding. */
export const minor = z.number().int("Amounts are whole numbers of minor units (100 = 1 credit).").positive("The amount must be above zero.").max(Number.MAX_SAFE_INTEGER);

/** The domain schemas take decimal text such as "1500.00". Convert with integer arithmetic only. */
export const minorToText = (m: number): string => `${Math.floor(m / MINOR_PER_SC)}.${String(m % MINOR_PER_SC).padStart(2, "0")}`;

export const userBody = z.object({
  external_id: z.string().regex(EXTERNAL_ID, "1 to 64 characters: letters, digits and . _ : @ -"),
  name: z.string().trim().min(1, "Enter a name.").max(120, "Keep the name under 120 characters."),
  role: z.enum(["client", "freelancer"], { message: "role must be client or freelancer." }),
});

const milestoneBody = z.object({
  title: z.string(),
  due_date: z.string(),
  amount: minor,
});

const termsFields = {
  amount: minor,
  review_period_days: z.number().int().min(1).max(14),
  revision_limit: z.number().int().min(0).max(5),
  milestones: z.array(milestoneBody),
};

export const createBody = z.object({
  freelancer: z.string(),
  title: z.string(),
  description: z.string(),
  ...termsFields,
});

export const counterBody = z.object({ ...termsFields, note: z.string() });
export const reasonBody = z.object({ reason: z.string() });
export const optionalReasonBody = z.object({ reason: z.string().optional() });
export const messageBody = z.object({ text: z.string() });
export const deliverBody = z.object({
  file_name: z.string(),
  size_bytes: z.number().int(),
  sha256: z.string(),
  note: z.string().optional(),
});
export const evidenceBody = z.object({
  text: z.string().optional(),
  files: z.array(z.object({ file_name: z.string(), size_bytes: z.number().int(), sha256: z.string() })).optional(),
});
export const amountBody = z.object({ amount: minor });

/** Turns API field names into what the domain schemas expect. */
export const termsToDomain = (b: z.infer<typeof createBody> | z.infer<typeof counterBody>) => ({
  totalSC: minorToText(b.amount),
  reviewPeriodDays: b.review_period_days,
  revisionLimit: b.revision_limit,
  milestones: b.milestones.map((m) => ({ title: m.title, dueDate: m.due_date, amountSC: minorToText(m.amount) })),
});

export const serializeEndpoint = (e: WebhookEndpoint) => ({ id: e.id, url: e.url, events: e.events, enabled: e.enabled, created_at: e.createdAt });

export const serializeDelivery = (d: WebhookDelivery) => ({
  event_id: d.eventId,
  type: d.type,
  status: d.status,
  attempts: d.attempts,
  last_status: d.lastStatus,
  last_error: d.lastError,
  next_attempt_at: d.status === "pending" ? d.nextAttemptAt : null,
  created_at: d.createdAt,
  delivered_at: d.deliveredAt,
});

export function serializeUser(platformId: string, u: User) {
  return { external_id: externalIdOf(platformId, u.id), name: u.name, role: u.role };
}

export function serializeContract(platformId: string, c: Contract) {
  return {
    id: c.id,
    ref: c.ref,
    title: c.title,
    description: c.description,
    state: c.state,
    version: c.version,
    client: externalIdOf(platformId, c.clientId),
    freelancer: externalIdOf(platformId, c.freelancerId),
    amount: c.amount,
    fee_bps: c.feeBps,
    milestones: c.milestones.map((m) => ({ title: m.title, due_date: m.dueDate, amount: m.amount })),
    review_period_days: c.reviewPeriodDays,
    revision_limit: c.revisionLimit,
    revisions_used: c.revisionsUsed,
    expires_at: c.expiresAt,
    delivered_at: c.deliveredAt,
    review_ends_at: c.reviewEndsAt,
    deliverable: c.deliverable && { name: c.deliverable.name, size_bytes: c.deliverable.sizeBytes, sha256: c.deliverable.sha256, note: c.deliverable.note },
    revision_reason: c.revisionReason,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

/** The service names its events like "raise_dispute"; the API names its endpoints like "dispute". allowed_actions uses the endpoint names, so a client can call exactly what it is told. */
const ENDPOINT_FOR: Record<string, string> = {
  counter_propose: "counter",
  accept_counter: "accept-counter",
  decline_counter: "decline-counter",
  start_work: "start-work",
  request_revision: "request-revision",
  raise_dispute: "dispute",
  withdraw_dispute: "withdraw-dispute",
  mutual_cancel: "cancel-funded",
};
export const endpointName = (action: string) => ENDPOINT_FOR[action] ?? action;

export function serializeView(platformId: string, v: ContractView) {
  return {
    ...serializeContract(platformId, v.contract),
    your_role: v.viewerKind,
    allowed_actions: [...v.actions.map(endpointName), ...(v.evidence.canSubmit ? ["evidence"] : [])],
    evidence: { can_submit: v.evidence.canSubmit, files_left: v.evidence.filesLeft },
    awaiting: v.terms.awaiting,
    terms_version: v.terms.version,
    cancel_requested_by: v.cancelRequestedBy ? externalIdOf(platformId, v.cancelRequestedBy) : null,
    dispute: v.dispute && { reason: v.dispute.reason, raised_by: v.dispute.raisedBy ? externalIdOf(platformId, v.dispute.raisedBy) : null, at: v.dispute.at },
    timeline: v.timeline.map((e) => ({ at: e.at, event: e.action, by: e.actorId ? externalIdOf(platformId, e.actorId) : null, by_role: e.actorRole, note: e.detail ?? null })),
    messages: v.messages.map((m) => ({ at: m.at, by: m.actorId ? externalIdOf(platformId, m.actorId) : null, text: m.detail ?? "" })),
  };
}

/**
 * A contract belongs to a platform only when BOTH people on it do. This keeps a platform from ever seeing a contract that a
 * person from the web app (or another platform) is part of, even if that person reused the same email.
 */
export const isPlatformContract = (platformId: string, c: Contract) => externalIdOf(platformId, c.clientId) !== null && externalIdOf(platformId, c.freelancerId) !== null;

export async function requirePlatformContract(c: ApiContext, id: string): Promise<Contract> {
  const contract = await c.repo.getContract(id);
  if (!contract || !isPlatformContract(c.platformId, contract)) throw new ApiError(404, "NOT_FOUND", "We could not find that contract.");
  return contract;
}

export const parseBody = async <T>(req: Request, schema: z.ZodType<T>): Promise<T> => schema.parse(await readJson(req));

type Run = (c: ApiContext, actor: Actor, id: string) => Promise<void>;

/** One entry per thing a person can do to a contract. Each calls the same EscrowService method the web app uses. */
export const ACTIONS: Record<string, Run> = {
  accept: async (c, a, id) => void (await c.svc.accept(a, id)),
  reject: async (c, a, id) => void (await c.svc.reject(a, id, (await parseBody(c.req, reasonBody)).reason)),
  counter: async (c, a, id) => {
    const b = await parseBody(c.req, counterBody);
    await c.svc.counterPropose(a, id, { ...termsToDomain(b), note: b.note });
  },
  "accept-counter": async (c, a, id) => void (await c.svc.acceptCounter(a, id)),
  "decline-counter": async (c, a, id) => void (await c.svc.declineCounter(a, id, (await parseBody(c.req, reasonBody)).reason)),
  cancel: async (c, a, id) => void (await c.svc.cancel(a, id, (await parseBody(c.req, optionalReasonBody)).reason)),
  fund: async (c, a, id) => void (await c.svc.fund(a, id, idempotencyKey(c.req))),
  "start-work": async (c, a, id) => void (await c.svc.startWork(a, id)),
  deliver: async (c, a, id) => {
    const b = await parseBody(c.req, deliverBody);
    await c.svc.deliver(a, id, { fileName: b.file_name, sizeBytes: b.size_bytes, sha256: b.sha256, note: b.note });
  },
  "request-revision": async (c, a, id) => void (await c.svc.requestRevision(a, id, (await parseBody(c.req, reasonBody)).reason)),
  approve: async (c, a, id) => void (await c.svc.approve(a, id, idempotencyKey(c.req))),
  dispute: async (c, a, id) => void (await c.svc.raiseDispute(a, id, (await parseBody(c.req, reasonBody)).reason)),
  "withdraw-dispute": async (c, a, id) => void (await c.svc.withdrawDispute(a, id)),
  "cancel-funded": async (c, a, id) => void (await c.svc.cancelFunded(a, id)),
  "decline-cancel": async (c, a, id) => void (await c.svc.declineCancel(a, id)),
  evidence: async (c, a, id) => {
    const b = await parseBody(c.req, evidenceBody);
    await c.svc.submitEvidence(a, id, { text: b.text ?? "", files: (b.files ?? []).map((f) => ({ name: f.file_name, sizeBytes: f.size_bytes, sha256: f.sha256 })) });
  },
  message: async (c, a, id) => void (await c.svc.sendMessage(a, id, (await parseBody(c.req, messageBody)).text)),
};
