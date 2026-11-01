import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { clerkEnabled } from "@/server/auth";

export const metadata = { title: "Log in" };

export default function SignInPage() {
  if (!clerkEnabled) redirect("/demo");
  return (
    <main id="main" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-4)", padding: "var(--space-12) var(--space-4)" }}>
      <Link href="/" style={{ fontFamily: "var(--font-display)", fontSize: "1.6rem", color: "var(--navy-900)", textDecoration: "none" }}>
        TrustLock
      </Link>
      <SignIn signUpUrl="/sign-up" />
    </main>
  );
}
