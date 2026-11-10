import { CONTRACT_STATES } from "@/domain/states";
import { actingUser, ApiError, externalIdParam, idempotencyKey, json, route } from "@/server/api-v1";
import { createBody, isPlatformContract, parseBody, serializeContract, termsToDomain } from "@/server/api-contracts";
import { userIdFor } from "@/server/platform";

export const dynamic = "force-dynamic";

/** The user's contracts, newest first. Optional ?state= filter. */
export const GET = route(async (c) => {
  const { actor } = await actingUser(c);
  const state = c.req.nextUrl.searchParams.get("state");
  if (state && !(CONTRACT_STATES as readonly string[]).includes(state)) throw new ApiError(422, "VALIDATION", `state must be one of: ${CONTRACT_STATES.join(", ")}`);
  const rows = (await c.svc.listContracts(actor)).map((r) => r.contract).filter((x) => isPlatformContract(c.platformId, x) && (!state || x.state === state));
  return json({ data: rows.map((x) => serializeContract(c.platformId, x)) });
});

/** A client proposes a contract to one of your freelancers. Send an Idempotency-Key so a retry cannot hire twice. */
export const POST = route(async (c) => {
  const { actor } = await actingUser(c);
  const body = await parseBody(c.req, createBody);
  const freelancer = await c.repo.getUserById(userIdFor(c.platformId, externalIdParam(body.freelancer, "freelancer id")));
  if (!freelancer) throw new ApiError(404, "USER_NOT_FOUND", "The freelancer is not registered. Create them first with POST /api/v1/users.");
  const contract = await c.svc.createContract(
    actor,
    { title: body.title, description: body.description, freelancerEmail: freelancer.email, ...termsToDomain(body) },
    idempotencyKey(c.req),
  );
  return json(serializeContract(c.platformId, contract), 201);
});
