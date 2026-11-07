import Image from "next/image";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import type { User } from "@/domain/types";
import { AccountSwitcher } from "@/components/account-switcher";
import { clerkEnabled, toActor } from "@/server/auth";
import { getContainer } from "@/server/container";
import brandMark from "@/app/icon.svg";
import { getT } from "@/i18n/server";

const ROLE_LABEL: Record<User["role"], string> = {
  client: "Client",
  freelancer: "Freelancer",
  arbitrator: "Arbitrator",
  admin: "Administrator",
  auditor: "Auditor",
};

function navFor(role: User["role"]) {
  if (role === "client" || role === "freelancer") {
    return [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/contracts", label: "Contracts" },
      { href: "/wallet", label: "Wallet" },
      { href: "/notifications", label: "Notifications" },
      { href: "/profile", label: "Profile and security" },
    ];
  }
  if (role === "arbitrator") return [{ href: "/dashboard", label: "My cases" }, { href: "/notifications", label: "Notifications" }];
  if (role === "admin") return [{ href: "/admin", label: "Admin dashboard" }, { href: "/admin/mail", label: "Mail catcher" }, { href: "/audit", label: "Audit log" }];
  return [{ href: "/audit", label: "Audit log" }];
}

export async function Shell({ viewer, active, children }: { viewer: User; active: string; children: React.ReactNode }) {
  const t = await getT();
  const wantsBell = viewer.role === "client" || viewer.role === "freelancer" || viewer.role === "arbitrator";
  const unread = wantsBell ? await (await getContainer()).svc.unreadCount(toActor(viewer)) : 0;
  return (
    <div className="app">
      <aside className="side">
        <Link href="/" className="brand">
          <Image src={brandMark} alt="" width={24} height={24} />
          {t("TrustLock")}
        </Link>
        <nav aria-label={t("Main")}>
          {navFor(viewer.role).map((item) => (
            <Link key={item.href} href={item.href} aria-current={active === item.href ? "page" : undefined}>
              {t(item.label)}
              {item.href === "/notifications" && unread > 0 && (
                <span className="count" aria-label={t("{count} unread", { count: unread })}>
                  {unread}
                </span>
              )}
            </Link>
          ))}
        </nav>
        {clerkEnabled ? (
          <div className="who">
            <span>
              <strong>{viewer.name}</strong>
              <br />
              {t(ROLE_LABEL[viewer.role])}
            </span>
            <UserButton afterSwitchSessionUrl="/dashboard" />
          </div>
        ) : (
          <div className="who">
            <AccountSwitcher viewer={viewer} users={await (await getContainer()).repo.listUsers()} />
          </div>
        )}
      </aside>
      <main id="main" className="main">
        {children}
      </main>
    </div>
  );
}
