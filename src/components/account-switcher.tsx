import type { User } from "@/domain/types";
import { demoLogin, demoLogout } from "@/app/actions";
import { getT } from "@/i18n/server";

const ROLE_LABEL: Record<User["role"], string> = {
  client: "Client",
  freelancer: "Freelancer",
  arbitrator: "Arbitrator",
  admin: "Administrator",
  auditor: "Auditor",
};
const ROLE_ORDER: User["role"][] = ["admin", "client", "freelancer", "arbitrator", "auditor"];

/**
 * Demo mode only: a menu of every demo account, like the account menu in Gmail.
 * One click signs in as that person and lands on their home page. It is plain HTML (details and forms), so it works without scripts.
 * With real sign-in (Clerk) this is not used: Clerk's own account menu does the same job.
 */
export async function AccountSwitcher({ viewer, users }: { viewer: User; users: User[] }) {
  const t = await getT();
  const sorted = [...users].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name));
  return (
    <details className="switcher popper">
      <summary>
        <span className="avatar" aria-hidden="true">
          {viewer.name.slice(0, 1)}
        </span>
        <span className="who-text">
          <span className="who-name">{viewer.name}</span>
          <span className="who-role">{t(ROLE_LABEL[viewer.role])}</span>
          <span className="sr-only">{t(", switch account")}</span>
        </span>
        <span className="chev" aria-hidden="true" />
      </summary>
      <div className="switcher-menu" role="group" aria-label={t("Switch account")}>
        <p className="switcher-title">{t("Switch account (demo)")}</p>
        <ul>
          {sorted.map((u) => (
            <li key={u.id}>
              <form action={demoLogin}>
                <input type="hidden" name="userId" value={u.id} />
                <button type="submit" aria-current={u.id === viewer.id ? "true" : undefined}>
                  <span className="avatar" aria-hidden="true">
                    {u.name.slice(0, 1)}
                  </span>
                  <span className="who-text">
                    <span className="who-name">{u.name}</span>
                    <span className="who-role">{t(ROLE_LABEL[u.role])}</span>
                  </span>
                  {u.id === viewer.id && <span className="here">{t("Current")}</span>}
                </button>
              </form>
            </li>
          ))}
        </ul>
        <form action={demoLogout}>
          <button type="submit" className="switcher-out">
            {t("Sign out")}
          </button>
        </form>
      </div>
    </details>
  );
}
