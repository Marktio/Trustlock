import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import brandMark from "@/app/icon.svg";

export const COMPANY = "TrustLock";
export const CONTACT_EMAIL = "trustlock@gmail.com";
export const LEGAL_UPDATED = "3 November 2026";

/** Shared page frame for the privacy policy and terms of use. */
export function LegalPage({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <main id="main" className="legal">
      <Link href="/" className="legal-brand">
        <Image src={brandMark} alt="" width={24} height={24} />
        TrustLock
      </Link>
      <h1>{title}</h1>
      <p className="legal-meta">Last updated {LEGAL_UPDATED}</p>
      <p className="legal-intro">{intro}</p>
      {children}
      <nav className="legal-foot" aria-label="Legal">
        <Link href="/">
          <ArrowLeft size={16} weight="bold" aria-hidden="true" />
          Back to the home page
        </Link>
        <Link href="/privacy">Privacy policy</Link>
        <Link href="/terms">Terms of use</Link>
      </nav>
    </main>
  );
}

export function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="legal-sec">
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  );
}
