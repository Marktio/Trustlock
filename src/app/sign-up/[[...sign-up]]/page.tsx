import { SignUp } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { clerkEnabled } from "@/server/auth";

export const metadata = { title: "Create your account" };

/** The landing page sends ?role=client or ?role=freelancer so the role question afterwards is already answered. */
export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  if (!clerkEnabled) redirect("/demo");
  const { role } = await searchParams;
  const picked = role === "client" || role === "freelancer" ? role : null;
  return (
    <AuthShell
      title="Create your TrustLock account"
      note={
        picked && (
          <p className="auth-role">
            Creating your <strong>{picked}</strong> account
          </p>
        )
      }
    >
      <SignUp forceRedirectUrl={picked ? `/onboarding?role=${picked}` : "/onboarding"} signInUrl="/sign-in" />
    </AuthShell>
  );
}
