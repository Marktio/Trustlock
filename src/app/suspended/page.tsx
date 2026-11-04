import { demoLogout } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { clerkEnabled } from "@/server/auth";

export const metadata = { title: "Account suspended" };

export default function Suspended() {
  return (
    <main id="main" className="landing page-narrow">
      <h1>Your account is suspended</h1>
      <p className="muted">You cannot sign in to TrustLock or act on contracts right now. Your data and any money in escrow are safe. Contact an administrator to ask for a review.</p>
      {!clerkEnabled && (
        <form action={demoLogout}>
          <SubmitButton className="btn" pendingLabel="Signing out…">Switch account</SubmitButton>
        </form>
      )}
    </main>
  );
}
