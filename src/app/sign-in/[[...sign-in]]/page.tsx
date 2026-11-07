import { SignIn } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { clerkEnabled } from "@/server/auth";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Log in") };
}

export default async function SignInPage() {
  const t = await getT();
  if (!clerkEnabled) redirect("/demo");
  return (
    <AuthShell title={t("Log in to TrustLock")}>
      <SignIn signUpUrl="/sign-up" />
    </AuthShell>
  );
}
