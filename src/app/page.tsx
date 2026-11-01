import Link from "next/link";
import { HowItWorks } from "@/components/how-it-works";
import { StateRail } from "@/components/ui";
import { formatSC } from "@/domain/money";
import { getViewer, clerkEnabled } from "@/server/auth";
import { getRegion } from "@/server/region";

export default async function Landing() {
  const viewer = await getViewer();
  const { currency } = await getRegion();
  const startAs = (role: "client" | "freelancer") => (clerkEnabled ? `/sign-up?role=${role}` : `/demo?role=${role}`);
  return (
    <div className="landing">
      <header className="landing-nav">
        <span style={{ fontFamily: "var(--font-display)", fontSize: "1.4rem", flexGrow: 1, color: "var(--navy-900)" }}>TrustLock</span>
        <nav aria-label="Page sections" style={{ display: "flex", gap: "var(--space-6)", marginRight: "var(--space-4)" }}>
          <HowItWorks />
          <a href="#roles">Roles</a>
        </nav>
        {viewer ? (
          <Link className="btn btn-primary" href={viewer.role === "admin" ? "/admin" : viewer.role === "auditor" ? "/audit" : "/dashboard"}>
            Open dashboard
          </Link>
        ) : (
          <Link className="btn" href={clerkEnabled ? "/sign-in" : "/demo"}>
            Log in
          </Link>
        )}
      </header>

      <section className="hero" aria-labelledby="hero-h">
        <div className="copy">
          <h1 id="hero-h">Pay when the work is delivered. Get paid when it is approved.</h1>
          <p className="lead">
            A practice escrow for freelance jobs. The client&apos;s payment is locked until both sides confirm, and every step goes into a log nobody can quietly edit.
          </p>
          <div className="btn-row">
            <Link className="btn btn-primary" href={startAs("client")}>
              Register as client
            </Link>
            <Link className="btn" href={startAs("freelancer")}>
              Register as freelancer
            </Link>
          </div>
          <p className="small muted">{clerkEnabled ? "Sign-up and login run through Clerk." : "Demo mode: pick a ready-made account, no sign-up needed."}</p>
        </div>

        <div className="vault" aria-label="Example contract">
          <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", flexWrap: "wrap" }}>
            <h2>Brand identity refresh</h2>
            <span className="pill tone-amber">Funded</span>
          </div>
          <span className="mono" style={{ color: "var(--navy-300)" }}>
            TL-2026-0142 · Amina W. and Brian O.
          </span>
          <StateRail
            state="funded"
            steps={[
              { state: "draft", label: "Draft" },
              { state: "proposed", label: "Proposed" },
              { state: "accepted", label: "Accepted" },
              { state: "funded", label: "Funded" },
              { state: "delivered", label: "Delivered" },
              { state: "completed", label: "Done" },
            ]}
          />
          <div className="held-box">
            <div className="small" style={{ color: "var(--navy-300)" }}>Held in escrow</div>
            <div className="big">{formatSC(4_500_000, true, currency)}</div>
            <div className="small" style={{ color: "var(--navy-300)" }}>Released only after both sides confirm delivery.</div>
          </div>
        </div>
      </section>

      <section id="how" className="steps" aria-label="How it works">
        <div className="card">
          <h3>1. Lock the funds</h3>
          <p className="muted">The client funds the contract. The money moves from Available to Held, and nobody can spend it.</p>
        </div>
        <div className="card">
          <h3>2. Deliver the work</h3>
          <p className="muted">The freelancer uploads the file. Its SHA-256 fingerprint is recorded as proof of what was delivered.</p>
        </div>
        <div className="card">
          <h3>3. Approve and release</h3>
          <p className="muted">The client approves, or the review period ends. Payment is released exactly once.</p>
        </div>
      </section>

      <section id="roles" className="steps" aria-label="Roles" style={{ marginTop: "var(--space-8)" }}>
        <div className="card">
          <h3>Client</h3>
          <p className="muted">Creates the contract, funds the escrow, reviews the delivery and approves the payment.</p>
        </div>
        <div className="card">
          <h3>Freelancer</h3>
          <p className="muted">Accepts the contract, does the work, uploads the delivery and receives the payment.</p>
        </div>
        <div className="card">
          <h3>Arbitrator, admin and auditor</h3>
          <p className="muted">Assigned by an administrator. They resolve disputes and verify the audit log.</p>
        </div>
      </section>
    </div>
  );
}
