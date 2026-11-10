import { json, readJson, route, ApiError } from "@/server/api-v1";
import { serializeUser, userBody } from "@/server/api-contracts";
import { placeholderEmail, userIdFor } from "@/server/platform";

export const dynamic = "force-dynamic";

/**
 * Link one of your users to TrustLock. Safe to call again: the same external_id updates the name.
 * You send an id and a display name only. TrustLock never holds your users' email addresses.
 * The role cannot change afterwards, because money and contracts already depend on it.
 */
export const POST = route(async (c) => {
  const body = userBody.parse(await readJson(c.req));
  const id = userIdFor(c.platformId, body.external_id);
  const existing = await c.repo.getUserById(id);
  if (existing && existing.role !== body.role) throw new ApiError(409, "ROLE_IMMUTABLE", `This user is already registered as a ${existing.role}. A role cannot be changed.`);

  const user = { id, name: body.name, email: placeholderEmail(c.platformId, body.external_id), role: body.role };
  await c.repo.upsertUser(user);
  return json(serializeUser(c.platformId, user), existing ? 200 : 201);
});
