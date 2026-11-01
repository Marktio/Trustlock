import { getContainer } from "@/server/container";
import { cronAuthorized, triggerScheduler } from "@/server/ops";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Runs the timed jobs: auto-approval after the review period, expiry of old proposals and unfunded contracts.
 * Call it every few minutes from a cron service with `Authorization: Bearer $CRON_SECRET`. Without CRON_SECRET it stays off.
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "The scheduler endpoint is off. Set CRON_SECRET to turn it on." }, { status: 503 });
  if (!cronAuthorized(req.headers.get("authorization"), secret)) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const result = await triggerScheduler(await getContainer(), new Date());
  return NextResponse.json(result, { status: result.ok ? 200 : 500, headers: { "Cache-Control": "no-store" } });
}

export const GET = handle;
export const POST = handle;
