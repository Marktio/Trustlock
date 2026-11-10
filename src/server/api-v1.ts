import { NextResponse, after, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { DomainError, type DomainErrorCode } from "@/domain/errors";
import type { EscrowService } from "@/domain/escrow-service";
import { MoneyError } from "@/domain/money";
import type { EscrowRepository } from "@/domain/repository";
import type { Actor, User } from "@/domain/types";
import { getContainer } from "./container";
import type { Limit } from "./rate-limit";
import { checkLimit } from "./shared-limiter";
import { EXTERNAL_ID, KEY_PREFIX, getPlatformRepo, hashKey, namespaceOf, userIdFor, type KeyMode, type PlatformRepository, type RequestLog } from "./platform";

/**
 * Shared plumbing for /api/v1: API key check, rate limits, error shape. Business rules stay in EscrowService,
 * so the API cannot do anything the web app could not (the state machine, ledger and audit log are the same code).
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

const HTTP: Record<DomainErrorCode, number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  VALIDATION: 422,
  ILLEGAL_TRANSITION: 409,
  INSUFFICIENT_FUNDS: 402,
  CONFLICT: 409,
  LIMIT: 422,
  GATEWAY_FAILED: 502,
  IDEMPOTENCY_KEY_REQUIRED: 400,
};

/** The web app's messages talk about forms and reloading. For API callers, say what to do instead. */
const API_MESSAGE: Partial<Record<DomainErrorCode, string>> = {
  IDEMPOTENCY_KEY_REQUIRED: "Send an Idempotency-Key header (8 to 100 characters, new for each distinct request) so a retry cannot repeat this.",
  CONFLICT: "This contract changed while your request was running. Read it again and retry.",
};

const fail = (code: string, message: string, status: number, headers?: Record<string, string>) => json({ error: { code, message } }, status, headers);

function zodMessage(e: ZodError): string {
  const issue = e.issues[0];
  const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
  return `${where}${issue?.message ?? "Check the request body."}`;
}

/**
 * instanceof alone can miss in `next dev`, where a hot reload may load the error class twice. Matching the shape too
 * keeps a refused move a 409 instead of a 500.
 */
function asDomainError(e: unknown): DomainError | null {
  if (e instanceof DomainError) return e;
  const code = (e as { code?: unknown } | null)?.code;
  return e instanceof Error && /Error$/.test(e.name) && typeof code === "string" && Object.hasOwn(HTTP, code) ? (e as DomainError) : null;
}

/** Every failure has the same shape: { error: { code, message } }. Messages are safe to show; nothing internal is leaked (NFR-1.10). */
export function toErrorResponse(e: unknown): Response {
  if (e instanceof ApiError) return fail(e.code, e.message, e.status, e.headers);
  const domain = asDomainError(e);
  if (domain) return fail(domain.code, API_MESSAGE[domain.code] ?? domain.message, HTTP[domain.code] ?? 400);
  if (e instanceof MoneyError) return fail("VALIDATION", e.message, 422);
  if (e instanceof ZodError) return fail("VALIDATION", zodMessage(e), 422);
  console.error("[api/v1] unexpected error", e);
  return fail("INTERNAL", "Something went wrong on our side. Try again in a moment.", 500);
}

export const API_IP_LIMIT: Limit = { name: "api-ip", max: 300, windowMs: 60_000 };
export const API_KEY_LIMIT: Limit = { name: "api-key", max: 120, windowMs: 60_000 };

export interface ApiContext {
  req: NextRequest;
  /** The namespace this key works in: the platform id, plus a trailing "t" for test keys. Users and contracts are scoped by it. */
  platformId: string;
  mode: KeyMode;
  keyId: string;
  svc: EscrowService;
  repo: EscrowRepository;
  platforms: PlatformRepository;
}

type Handler<P> = (c: ApiContext, params: P) => Promise<Response>;

function tooMany(retryAfter: number) {
  return new ApiError(429, "RATE_LIMITED", "Too many requests. Wait a moment and try again.", { "Retry-After": String(retryAfter) });
}

async function limit(key: string, rule: Limit) {
  const d = await checkLimit(key, rule);
  if (!d.allowed) throw tooMany(d.retryAfter);
}

function bearerKey(req: NextRequest): string {
  const token = /^Bearer (\S+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!token?.startsWith(KEY_PREFIX)) throw new ApiError(401, "MISSING_API_KEY", "Send your key as: Authorization: Bearer tlk_...");
  return token;
}

async function authenticate(req: NextRequest, platforms: PlatformRepository) {
  await limit(`ip:${req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"}`, API_IP_LIMIT);
  const record = await platforms.findKeyByHash(hashKey(bearerKey(req)));
  if (!record || record.revokedAt) throw new ApiError(401, "INVALID_API_KEY", "That API key is not valid or has been revoked.");
  await limit(`key:${record.id}`, API_KEY_LIMIT);
  return record;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

/** What the usage log records for a path: ids become :id, so "/contracts/3f2a..." groups with every other contract call. */
export function logPath(pathname: string): string {
  const p = pathname.replace(/^\/api\/v1/, "").replace(UUID, ":id");
  return p.replace(/^\/(users|webhook-endpoints)\/[^/]+/, "/$1/:id") || "/";
}

async function errorCodeOf(res: Response): Promise<string | null> {
  if (res.status < 400) return null;
  try {
    return ((await res.clone().json()) as { error?: { code?: string } }).error?.code ?? null;
  } catch {
    return null;
  }
}

/** Best effort and never in the way of the answer: after() runs it once the response has gone out, and a failure is only logged. */
function record(platforms: PlatformRepository, entry: RequestLog) {
  const write = () => platforms.insertLog(entry).catch((e) => console.warn("[api/v1] could not write the usage log:", e instanceof Error ? e.message : e));
  try {
    after(write);
  } catch {
    void write(); // outside a request (tests, scripts): there is no after() to hook into
  }
}

/** Wraps a route handler: checks the key, applies the limits, logs the call, and turns any failure into the standard error body. */
export function route<P = Record<string, never>>(handler: Handler<P>) {
  return async (req: NextRequest, ctx: { params: Promise<P> }): Promise<Response> => {
    const started = Date.now();
    let key: { id: string; platformId: string; mode: KeyMode } | null = null;
    let platforms: PlatformRepository | null = null;
    let res: Response;
    try {
      platforms = await getPlatformRepo();
      const found = await authenticate(req, platforms);
      key = { id: found.id, platformId: namespaceOf(found), mode: found.mode };
      const { svc, repo } = await getContainer();
      res = await handler({ req, platformId: key.platformId, mode: key.mode, keyId: key.id, svc, repo, platforms }, await ctx.params);
    } catch (e) {
      res = toErrorResponse(e);
    }
    if (key && platforms) {
      res.headers.set("TrustLock-Mode", key.mode);
      record(platforms, {
        id: randomUUID(),
        namespace: key.platformId,
        keyId: key.id,
        method: req.method,
        path: logPath(new URL(req.url).pathname),
        status: res.status,
        code: await errorCodeOf(res),
        ms: Date.now() - started,
        at: new Date().toISOString(),
      });
    }
    return res;
  };
}

const MAX_BODY_BYTES = 64 * 1024;

export async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new ApiError(413, "BODY_TOO_LARGE", "The request body is too large.");
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "INVALID_JSON", "The request body is not valid JSON.");
  }
}

export function externalIdParam(value: unknown, label = "user id"): string {
  if (typeof value !== "string" || !EXTERNAL_ID.test(value)) {
    throw new ApiError(422, "VALIDATION", `The ${label} must be 1 to 64 characters: letters, digits and . _ : @ -`);
  }
  return value;
}

export async function loadPlatformUser(c: ApiContext, externalId: string): Promise<{ user: User; actor: Actor }> {
  const user = await c.repo.getUserById(userIdFor(c.platformId, externalId));
  if (!user) throw new ApiError(404, "USER_NOT_FOUND", "No user with that id is registered. Create it first with POST /api/v1/users.");
  return { user, actor: { id: user.id, role: user.role } };
}

/** The user the call is made for, named in the TrustLock-User header. Every contract and wallet action runs as this user. */
export async function actingUser(c: ApiContext) {
  const header = c.req.headers.get("trustlock-user");
  if (!header) throw new ApiError(400, "MISSING_USER", "Send a TrustLock-User header with the id of the user this request is for.");
  return loadPlatformUser(c, externalIdParam(header, "TrustLock-User header"));
}

export const idempotencyKey = (req: Request): string | undefined => req.headers.get("idempotency-key") ?? undefined;
