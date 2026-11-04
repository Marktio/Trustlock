import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { RateLimiter, limitsFor, readEnvLimit } from "@/server/rate-limit";

const clerkOn = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

const isPublic = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)", "/demo(.*)", "/privacy", "/terms", "/api/health", "/api/cron/(.*)", "/how-it-works/(.*)"]);

const limiter = new RateLimiter();
const envLimits = { general: readEnvLimit(process.env.RATE_LIMIT_PER_MINUTE), auth: readEnvLimit(process.env.AUTH_RATE_LIMIT_PER_MINUTE) };

function describe(req: NextRequest) {
  const session = req.cookies.get("tl_demo_user")?.value ?? req.cookies.get("__session")?.value?.slice(-32) ?? null;
  return {
    path: req.nextUrl.pathname,
    method: req.method,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
    userKey: session ? `s:${session}` : null,
    prefetch: req.headers.has("next-router-prefetch") || req.headers.get("purpose") === "prefetch",
  };
}

/** Returns a 429 response when the caller is over a limit, otherwise null (NFR-1.6). */
function limited(req: NextRequest): NextResponse | null {
  const now = Date.now();
  for (const { limit, key } of limitsFor(describe(req), envLimits)) {
    const d = limiter.check(key, limit, now);
    if (!d.allowed) {
      return new NextResponse("Too many requests. Wait a moment and try again.", { status: 429, headers: { "Retry-After": String(d.retryAfter), "Cache-Control": "no-store" } });
    }
  }
  return null;
}

/**
 * With Clerk keys, every route except the public ones needs a signed-in user.
 * This is only the first gate: pages and server actions check the role again on the server (FR-1.12).
 */
export default clerkOn
  ? clerkMiddleware(async (auth, req) => {
      const stop = limited(req);
      if (stop) return stop;
      if (!isPublic(req)) await auth.protect();
    })
  : (req: NextRequest) => limited(req) ?? NextResponse.next();

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)"],
};
