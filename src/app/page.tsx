import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { HowItWorks } from "@/components/how-it-works";
import { ExampleContract } from "@/components/example-contract";
import { TaglineReveal } from "@/components/tagline-reveal";
import { ProductPreview } from "@/components/product-preview";
import { Pill } from "@/components/ui";
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

          <ExampleContract currency={currency} />
        </section>

        <ProductPreview />

        <section id="how" className="lp-how" aria-labelledby="how-h">
          <h2 id="how-h" className="heading-4 lp-section-title">
            How the money moves
          </h2>
          <ol className="lp-how-list">
            <li>
              <div>
                <h3 className="heading-6">Lock the funds</h3>
                <p className="body-3 lp-muted">The client funds the contract. The money moves from Available to Held, and nobody can spend it.</p>
              </div>
              <Pill state="funded" />
            </li>
            <li>
              <div>
                <h3 className="heading-6">Deliver the work</h3>
                <p className="body-3 lp-muted">The freelancer uploads the file. Its SHA-256 fingerprint is recorded as proof of what was delivered.</p>
              </div>
              <Pill state="delivered" />
            </li>
            <li>
              <div>
                <h3 className="heading-6">Approve and release</h3>
                <p className="body-3 lp-muted">The client approves, or the review period ends. Payment is released exactly once.</p>
              </div>
              <Pill state="completed" />
            </li>
          </ol>
        </section>

        <section className="lp-tagline-wrap" aria-label="In short">
          <TaglineReveal text="Held money cannot be spent by anyone. It is released once, when the client approves or the review period ends." />
        </section>

        <section id="roles" className="lp-roles" aria-labelledby="roles-h">
          <h2 id="roles-h" className="heading-4 lp-section-title">
            Who does what
          </h2>
          <div className="lp-roles-body">
            <div className="lp-role">
              <h3 className="heading-6">Client</h3>
              <p className="body-3 lp-muted">Creates the contract, funds the escrow, reviews the delivery and approves the payment.</p>
            </div>
            <div className="lp-role">
              <h3 className="heading-6">Freelancer</h3>
              <p className="body-3 lp-muted">Accepts the contract, does the work, uploads the delivery and receives the payment.</p>
            </div>
            <div className="lp-role lp-role-wide">
              <h3 className="heading-6">Arbitrator, admin and auditor</h3>
              <p className="body-3 lp-muted">Assigned by an administrator. They resolve disputes and verify the audit log.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer caption-2">
        <p>Practice credits only. No real money is used. © 2026 TrustLock.</p>
        <nav className="lp-legal" aria-label="Legal">
          <Link href="/privacy">Privacy policy</Link>
          <Link href="/terms">Terms of use</Link>
        </nav>
      </footer>
    </div>
  );
}
