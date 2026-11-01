import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Actor, Role, User } from "@/domain/types";
import { getContainer } from "./container";
import { getRegion } from "./region";

/** Clerk is used when both keys are set. Without them the app runs in demo mode with seeded accounts. */
export const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

export const DEMO_COOKIE = "tl_demo_user";
export const ROLES: readonly Role[] = ["client", "freelancer", "arbitrator", "admin", "auditor"];
/** Roles a person can pick for themselves. The other three are created by an administrator (FR-1.1). */
export const SELF_SERVE_ROLES: readonly Role[] = ["client", "freelancer"];

type Resolved = { user: User } | { needsRole: true } | { suspended: true } | null;

async function resolve(): Promise<Resolved> {
  const { repo } = await getContainer();

  if (clerkEnabled) {
    const { currentUser } = await import("@clerk/nextjs/server");
    const cu = await currentUser();
    if (!cu) return null;
    const role = cu.publicMetadata?.role;
    if (typeof role !== "string" || !ROLES.includes(role as Role)) return { needsRole: true };
    const email = cu.primaryEmailAddress?.emailAddress ?? "";
    const user: User = { id: cu.id, name: cu.fullName ?? (email || "TrustLock user"), email, role: role as Role };
    await repo.upsertUser(user);
    if (await (await getContainer()).svc.isSuspended(user.id)) return { suspended: true };
    return { user: { ...user, currency: (await getRegion()).currency } };
  }

  const id = (await cookies()).get(DEMO_COOKIE)?.value;
  if (!id) return null;
  const user = await repo.getUserById(id);
  // Copy, so the display currency of one request never leaks into the stored user or another request.
  if (!user) return null;
  if (await (await getContainer()).svc.isSuspended(user.id)) return { suspended: true };
  return { user: { ...user, currency: (await getRegion()).currency } };
}

export async function getViewer(): Promise<User | null> {
  const r = await resolve();
  return r && "user" in r ? r.user : null;
}

/** For pages behind sign-in. Sends signed-out visitors to sign in, and new Clerk users to pick a role. */
export async function requireViewer(roles?: readonly Role[]): Promise<User> {
  const r = await resolve();
  if (!r) redirect(clerkEnabled ? "/sign-in" : "/demo");
  if ("needsRole" in r) redirect("/onboarding");
  if ("suspended" in r) redirect("/suspended");
  if (roles && !roles.includes(r.user.role)) redirect("/dashboard");
  return r.user;
}

export const toActor = (u: User): Actor => ({ id: u.id, role: u.role, currency: u.currency });
