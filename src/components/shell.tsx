import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import type { User } from "@/domain/types";
import { AccountSwitcher } from "@/components/account-switcher";
import { clerkEnabled, toActor } from "@/server/auth";
import { getContainer } from "@/server/container";

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
  const wantsBell = viewer.role === "client" || viewer.role === "freelancer" || viewer.role === "arbitrator";
  const unread = wantsBell ? await (await getContainer()).svc.unreadCount(toActor(viewer)) : 0;
  return (
    <div className="app">
      <aside className="side">
        <Link href="/" className="brand">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--amber-400)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" />
            <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
          </svg>
          TrustLock
        </Link>
        <nav aria-label="Main">
          {navFor(viewer.role).map((item) => (
            <Link key={item.href} href={item.href} aria-current={active === item.href ? "page" : undefined}>
              {item.label}
              {item.href === "/notifications" && unread > 0 && (
                <span className="count" aria-label={`${unread} unread`}>
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
              {ROLE_LABEL[viewer.role]}
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
