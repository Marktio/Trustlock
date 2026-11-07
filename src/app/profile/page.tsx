import { Shell } from "@/components/shell";
import { requireViewer } from "@/server/auth";
import { clerkEnabled } from "@/server/auth";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Profile and security") };
}

export default async function Profile() {
  const t = await getT();
  const viewer = await requireViewer(["client", "freelancer"]);
  return (
    <Shell viewer={viewer} active="/profile">
      <div>
        <h1>{t("Profile and security")}</h1>
        <p className="muted">{t("Your account details. Roles can only be changed by an administrator.")}</p>
      </div>
      <section className="card" aria-labelledby="acct-h">
        <h2 id="acct-h">{t("Account")}</h2>
        <div className="kv"><span>{t("Name")}</span><strong>{viewer.name}</strong></div>
        <div className="kv"><span>{t("Email")}</span><span>{viewer.email}</span></div>
        <div className="kv"><span>{t("Role")}</span><span className="u-cap">{viewer.role}</span></div>
      </section>
      <section className="card" aria-labelledby="sec-h">
        <h2 id="sec-h">{t("Security")}</h2>
        <p className="muted">
          {clerkEnabled
            ? t("Password, two-step verification and active sessions are managed from the account menu in the sidebar.")
            : t("Demo mode: sign-in is a ready-made account, so there is no password to manage. With Clerk keys set, password and two-step verification appear here.")}
        </p>
      </section>
    </Shell>
  );
}
