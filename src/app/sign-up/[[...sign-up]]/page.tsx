import { SignUp } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { clerkEnabled } from "@/server/auth";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Create your account") };
}

/** The landing page sends ?role=client or ?role=freelancer so the role question afterwards is already answered. */
export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const t = await getT();
  if (!clerkEnabled) redirect("/demo");
  const { role } = await searchParams;
  const picked = role === "client" || role === "freelancer" ? role : null;
  return (
    <AuthShell
      title={t("Create your TrustLock account")}
      note={
        picked && (
          <p className="auth-role">
            {t("Creating your")} <strong>{picked}</strong> {t("account")}
          </p>
        )
      }
    >
      <SignUp forceRedirectUrl={picked ? `/onboarding?role=${picked}` : "/onboarding"} signInUrl="/sign-in" />
    </AuthShell>
  );
}
