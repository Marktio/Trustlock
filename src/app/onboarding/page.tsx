import { redirect } from "next/navigation";
import { chooseRole } from "@/app/actions";
import { Notices } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { clerkEnabled } from "@/server/auth";

export const metadata = { title: "Choose your role" };

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ error?: string; role?: string }> }) {
  if (!clerkEnabled) redirect("/demo");
  const { error, role } = await searchParams;
  const picked = role === "client" || role === "freelancer" ? role : undefined;
  return (
    <main id="main" className="landing" style={{ maxWidth: 640, paddingTop: "var(--space-12)", display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <div>
        <h1>How will you use TrustLock?</h1>
        <p className="muted" style={{ marginTop: "var(--space-2)" }}>{picked ? `We pre-selected ${picked} from what you chose on the home page. Check it is right. ` : ""}You can only choose this once. Arbitrator, auditor and administrator accounts are created by an administrator.</p>
      </div>
      <Notices error={error} />
      <form action={chooseRole} className="card">
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <legend className="sr-only">Your role</legend>
          <label className="card" style={{ flexDirection: "row", alignItems: "center", gap: "var(--space-3)" }}>
            <input type="radio" name="role" value="client" defaultChecked={picked === "client"} required />
            <span>
              <strong>Client</strong>
              <br />
              <span className="small muted">I hire and pay for work.</span>
            </span>
          </label>
          <label className="card" style={{ flexDirection: "row", alignItems: "center", gap: "var(--space-3)" }}>
            <input type="radio" name="role" value="freelancer" defaultChecked={picked === "freelancer"} required />
            <span>
              <strong>Freelancer</strong>
              <br />
              <span className="small muted">I deliver work and get paid.</span>
            </span>
          </label>
        </fieldset>
        <div>
          <SubmitButton pendingLabel="Saving…">Continue</SubmitButton>
        </div>
      </form>
    </main>
  );
}
