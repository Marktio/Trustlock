import Image from "next/image";
import Link from "next/link";
import { ArrowRight, LockKey } from "@phosphor-icons/react/dist/ssr";
import { HowItWorks } from "@/components/how-it-works";
import { StateRail } from "@/components/ui";
import { formatSC } from "@/domain/money";
import { getViewer, clerkEnabled } from "@/server/auth";
import { getRegion } from "@/server/region";
import brandMark from "./icon.svg";

export default async function Landing() {
  const viewer = await getViewer();
  const { currency } = await getRegion();
  const startAs = (role: "client" | "freelancer") => (clerkEnabled ? `/sign-up?role=${role}` : `/demo?role=${role}`);
  const dashboardHref = viewer?.role === "admin" ? "/admin" : viewer?.role === "auditor" ? "/audit" : "/dashboard";
  return (
    <div className="landing">
      <header className="lp-header">
        <div className="lp-nav">
          <Link href="/" className="lp-brand">
            <Image src={brandMark} alt="" width={28} height={28} priority />
            TrustLock
          </Link>
          <nav aria-label="Page sections" className="lp-links">
            <HowItWorks className="lp-link" />
            <a href="#roles" className="lp-link">
              Roles
            </a>
          </nav>
          {viewer ? (
            <Link className="lp-btn lp-btn-sm lp-btn-solid" href={dashboardHref}>
              Open dashboard
            </Link>
          ) : (
            <Link className="lp-btn lp-btn-sm lp-btn-quiet" href={clerkEnabled ? "/sign-in" : "/demo"}>
              Log in
            </Link>
          )}
        </div>
      </header>

      <main id="main">
        <section className="lp-hero" aria-labelledby="hero-h">
          <div className="lp-copy">
            <p className="caption-1 lp-eyebrow">Practice escrow for freelance jobs</p>
            <h1 id="hero-h" className="lp-title">
              <span>Pay when the work is delivered.</span> <span>Get paid when it is approved.</span>
            </h1>
            <p className="body-7 lp-lead">Payment is locked until both sides confirm. Every step lands in a log nobody can quietly edit.</p>
            <div className="lp-actions">
              <Link className="lp-btn lp-btn-md lp-btn-solid" href={startAs("client")}>
                Register as client
              </Link>
              <Link className="lp-btn lp-btn-md lp-btn-text" href={startAs("freelancer")}>
                Register as freelancer
                <ArrowRight size={16} weight="bold" aria-hidden="true" />
              </Link>
            </div>
            {!clerkEnabled && <p className="caption-2 lp-note">Demo mode: choose a ready account. You do not need to sign up.</p>}
          </div>

          <aside className="lp-contract" aria-label="Example contract">
            <div className="lp-contract-head">
              <div>
                <p className="caption-4 lp-muted">Example contract</p>
                <h2 className="heading-6">Brand identity refresh</h2>
              </div>
              <span className="lp-badge caption-3">Funded</span>
            </div>
            <dl className="lp-parties">
              <div>
                <dt className="caption-4 lp-muted">Client</dt>
                <dd className="title-3">Amina W.</dd>
              </div>
              <div>
                <dt className="caption-4 lp-muted">Freelancer</dt>
                <dd className="title-3">Brian O.</dd>
              </div>
            </dl>
            <div className="lp-rail">
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
            </div>
            <div className="lp-held">
              <p className="body-5 lp-held-label">
                <LockKey size={20} weight="bold" aria-hidden="true" />
                Held in escrow
              </p>
              <p className="lp-amount">{formatSC(4_500_000, true, currency)}</p>
              <p className="caption-2 lp-held-note">Released only after both sides confirm delivery.</p>
            </div>
          </aside>
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
      </main>
    </div>
  );
}
