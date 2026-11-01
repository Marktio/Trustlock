import { getContainer } from "@/server/container";
import { checkHealth } from "@/server/ops";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Public health check for the API, the database and the scheduler. Returns no user data. */
export async function GET() {
  const health = await checkHealth(await getContainer(), new Date());
  return NextResponse.json(health, { status: health.status === "ok" ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
