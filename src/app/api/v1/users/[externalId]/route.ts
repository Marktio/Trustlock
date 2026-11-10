import { ApiError, externalIdParam, json, loadPlatformUser, route } from "@/server/api-v1";
import { serializeUser } from "@/server/api-contracts";

export const dynamic = "force-dynamic";

export const GET = route<{ externalId: string }>(async (c, params) => {
  const { user } = await loadPlatformUser(c, externalIdParam(params.externalId));
  const wallet = await c.repo.getBalances(user.id);
  if (await c.svc.isSuspended(user.id)) throw new ApiError(403, "USER_SUSPENDED", "This user has been suspended by a TrustLock administrator.");
  return json({ ...serializeUser(c.platformId, user), wallet });
});
