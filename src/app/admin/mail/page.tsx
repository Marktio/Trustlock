import Link from "next/link";
import { Shell } from "@/components/shell";
import { fmtDateTime } from "@/components/format";
import { requireViewer, toActor } from "@/server/auth";
import { getContainer } from "@/server/container";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Mail catcher") };
}

/** The simulated outbox (FR-7.2). Nothing is delivered anywhere; this is where a developer or marker can see what would have been sent. */
export default async function MailCatcher() {
  const t = await getT();
  const viewer = await requireViewer(["admin"]);
  const { svc } = await getContainer();
  const mails = await svc.mailCatcher(toActor(viewer), (s) => t(s));
  return (
    <Shell viewer={viewer} active="/admin/mail">
      <div>
        <h1>{t("Mail catcher")}</h1>
        <p className="muted">{t("Simulated emails. Nothing leaves this system. Bodies are fixed templates and never contain passwords, tokens or what users typed.")}</p>
        <p className="small">
          <Link href="/admin">{t("Back to the admin dashboard")}</Link>
        </p>
      </div>
      {mails.length === 0 ? (
        <div className="card">
          <p>{t("No emails yet.")}</p>
        </div>
      ) : (
        <ul className="u-nolist u-m0 u-p0 u-flex u-col u-gap-3">
          {mails.slice(0, 100).map((m) => (
            <li key={m.id} className="card">
              <strong>{m.subject}</strong>
              <span className="small muted">
                {t("To")} {m.toName} &lt;{m.to}&gt; · {fmtDateTime(m.at, t)}
              </span>
              <pre className="mail">{m.body}</pre>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
