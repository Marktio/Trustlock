import { demoLogout } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { clerkEnabled } from "@/server/auth";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Account suspended") };
}

export default async function Suspended() {
  const t = await getT();
  return (
    <main id="main" className="landing page-narrow">
      <h1>{t("Your account is suspended")}</h1>
      <p className="muted">{t("You cannot sign in to TrustLock or act on contracts right now. Your data and any money in escrow are safe. Contact an administrator to ask for a review.")}</p>
      {!clerkEnabled && (
        <form action={demoLogout}>
          <SubmitButton className="btn" pendingLabel={t("Signing out…")}>{t("Switch account")}</SubmitButton>
        </form>
      )}
    </main>
  );
}
