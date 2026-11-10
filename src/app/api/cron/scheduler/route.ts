import { getContainer } from "@/server/container";
import { cronAuthorized, triggerScheduler } from "@/server/ops";
import { getPlatformRepo } from "@/server/platform";
import { processWebhooks } from "@/server/webhooks";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Runs the timed jobs: auto-approval after the review period, expiry of old proposals and unfunded contracts, and webhook retries.
 * Call it every few minutes from a cron service with `Authorization: Bearer $CRON_SECRET`. Without CRON_SECRET it stays off.
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "The scheduler endpoint is off. Set CRON_SECRET to turn it on." }, { status: 503 });
  if (!cronAuthorized(req.headers.get("authorization"), secret)) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const container = await getContainer();
  const now = new Date();
  const result = await triggerScheduler(container, now);
  // Also sends webhook retries that are due, picks up anything the instant trigger missed, and trims the API request log to 30 days.
  let webhooks: { queued: number; attempted: number } | { error: string };
  try {
    const platforms = await getPlatformRepo();
    webhooks = await processWebhooks({ repo: container.repo, platforms }, now);
    await platforms.pruneLogs(new Date(now.getTime() - 30 * 86_400_000).toISOString());
  } catch (e) {
    console.error("[cron] webhooks failed", e);
    webhooks = { error: "Webhook processing failed. See the server log." };
  }
  return NextResponse.json({ ...result, webhooks }, { status: result.ok ? 200 : 500, headers: { "Cache-Control": "no-store" } });
}

export const GET = handle;
export const POST = handle;
