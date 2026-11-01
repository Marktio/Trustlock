import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { clerkEnabled } from "@/server/auth";

export const metadata = { title: "Create your account" };

/** The landing page sends ?role=client or ?role=freelancer so the role question afterwards is already answered. */
export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  if (!clerkEnabled) redirect("/demo");
  const { role } = await searchParams;
  const picked = role === "client" || role === "freelancer" ? role : null;
  return (
    <main id="main" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-4)", padding: "var(--space-12) var(--space-4)" }}>
      <Link href="/" style={{ fontFamily: "var(--font-display)", fontSize: "1.6rem", color: "var(--navy-900)", textDecoration: "none" }}>
        TrustLock
      </Link>
      {picked && (
        <p className="muted" style={{ textAlign: "center" }}>
          Creating your <strong>{picked}</strong> account.
        </p>
      )}
      <SignUp forceRedirectUrl={picked ? `/onboarding?role=${picked}` : "/onboarding"} signInUrl="/sign-in" />
    </main>
  );
}
