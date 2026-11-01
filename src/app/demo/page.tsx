import { notFound } from "next/navigation";
import { demoLogin } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { clerkEnabled } from "@/server/auth";
import { getContainer } from "@/server/container";

export const metadata = { title: "Choose a demo account" };

const BLURB: Record<string, string> = {
  client: "Creates contracts, funds escrow, approves delivery.",
  freelancer: "Accepts contracts, delivers work, gets paid.",
  arbitrator: "Decides disputes: pays the freelancer, refunds the client or splits the money.",
  admin: "Runs the platform: users, settings, assigns arbitrators to disputes, verifies the ledger.",
  auditor: "Read-only access to the audit log and ledger.",
};

export default async function DemoPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  if (clerkEnabled) notFound();
  const { role } = await searchParams;
  const { repo } = await getContainer();
  const order = ["client", "freelancer", "arbitrator", "admin", "auditor"];
  const DEMO_USERS = (await repo.listUsers()).sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
  const wanted = role === "client" || role === "freelancer" ? role : null;
  const suggested = wanted ? DEMO_USERS.find((u) => u.role === wanted)?.id : "demo_amina";
  return (
    <main id="main" className="landing" style={{ paddingTop: "var(--space-8)", display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <div>
        <h1>Choose a demo account</h1>
        <p className="muted" style={{ marginTop: "var(--space-2)", maxWidth: "60ch" }}>
          Clerk keys are not set, so TrustLock is running in demo mode. Data lives in memory and resets when the server restarts. Switch accounts any time from the sidebar.
        </p>
        {wanted && (
          <p style={{ marginTop: "var(--space-3)" }}>
            You chose to register as a <strong>{wanted}</strong>. In demo mode there is no sign-up, so use the highlighted {wanted} account below. With Clerk keys this button opens real sign-up.
          </p>
        )}
      </div>
      <div className="grid-3">
        {DEMO_USERS.map((u) => (
          <form key={u.id} action={demoLogin} className="card">
            <input type="hidden" name="userId" value={u.id} />
            <h2>{u.name}</h2>
            <span className="small muted" style={{ textTransform: "capitalize" }}>{u.role}</span>
            <p className="small">{BLURB[u.role]}</p>
            <div>
              <SubmitButton pendingLabel="Opening…" className={u.id === suggested ? "btn btn-primary" : "btn"}>
                Continue as {u.name.split(" ")[0]}
              </SubmitButton>
            </div>
          </form>
        ))}
      </div>
    </main>
  );
}
