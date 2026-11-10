import { ApiError, json, route } from "@/server/api-v1";

export const dynamic = "force-dynamic";

/** The most recent calls made with your keys in this mode (default 50, at most 200): method, path, status, error code, milliseconds. */
export const GET = route(async (c) => {
  const limit = Number(c.req.nextUrl.searchParams.get("limit") ?? 50);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new ApiError(422, "VALIDATION", "limit must be a whole number from 1 to 200.");
  const rows = await c.platforms.listLogs(c.platformId, limit);
  return json({ mode: c.mode, data: rows.map((r) => ({ at: r.at, method: r.method, path: r.path, status: r.status, error_code: r.code, ms: r.ms })) });
});
