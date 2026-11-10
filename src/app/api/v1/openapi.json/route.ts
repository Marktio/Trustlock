import { NextResponse } from "next/server";
import { openApiDocument } from "@/server/openapi";

export const dynamic = "force-dynamic";

/** Public description of the API. It has no data in it, so it needs no key. */
export async function GET(req: Request) {
  return NextResponse.json(openApiDocument(new URL(req.url).origin), { headers: { "Cache-Control": "public, max-age=300" } });
}
