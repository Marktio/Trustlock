import { SignIn } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { clerkEnabled } from "@/server/auth";

export const metadata = { title: "Log in" };

export default function SignInPage() {
  if (!clerkEnabled) redirect("/demo");
  return (
    <AuthShell title="Log in to TrustLock">
      <SignIn signUpUrl="/sign-up" />
    </AuthShell>
  );
}
