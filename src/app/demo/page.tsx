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
  auditor: "Read only access to the audit log and ledger.",
};
const ROLE_LABEL: Record<string, string> = { client: "Client", freelancer: "Freelancer", arbitrator: "Arbitrator", admin: "Administrator", auditor: "Auditor" };

export default async function DemoPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  if (clerkEnabled) notFound();
  const { role } = await searchParams;
  const { repo } = await getContainer();
  const order = ["client", "freelancer", "arbitrator", "admin", "auditor"];
  const users = (await repo.listUsers()).sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
  const wanted = role === "client" || role === "freelancer" ? role : null;
  const suggested = wanted ? users.find((u) => u.role === wanted)?.id : "demo_amina";
  return (
    <main id="main" className="landing demo">
      <div className="demo-head">
        <h1>Choose a demo account</h1>
        <p className="muted">
          Clerk keys are not set, so TrustLock is running in demo mode. Data lives in memory and resets when the server restarts. Switch accounts any time from the sidebar.
        </p>
        {wanted && (
          <p>
            You chose to register as a <strong>{wanted}</strong>. In demo mode there is no sign up, so use the highlighted {wanted} account below. With Clerk keys this button opens real sign up.
          </p>
        )}
      </div>
      <ul className="demo-list">
        {users.map((u) => (
          <li key={u.id}>
            <form action={demoLogin} className="demo-row">
              <input type="hidden" name="userId" value={u.id} />
              <div>
                <p>
                  <span className="demo-name">{u.name}</span>
                  <span className="demo-role">{ROLE_LABEL[u.role] ?? u.role}</span>
                </p>
                <p className="demo-blurb">{BLURB[u.role]}</p>
              </div>
              <SubmitButton pendingLabel="Opening…" className={u.id === suggested ? "btn btn-primary" : "btn"}>
                Continue as {u.name.split(" ")[0]}
              </SubmitButton>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
