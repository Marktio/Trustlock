import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check } from "@phosphor-icons/react/dist/ssr";
import { ExampleContract } from "@/components/example-contract";
import { getRegion } from "@/server/region";
import brandMark from "@/app/icon.svg";

const POINTS = [
  "The client's payment is locked until the work is approved",
  "The freelancer is paid exactly once, on approval",
  "Every step goes into a log nobody can quietly edit",
];

/** The split screen around Clerk's sign-in and sign-up forms: the idea on the left, the form on the right. */
export async function AuthShell({ title, note, children }: { title: string; note?: React.ReactNode; children: React.ReactNode }) {
  const { currency } = await getRegion();
  return (
    <main id="main" className="auth">
      <aside className="auth-aside" aria-label="About TrustLock">
        <Link href="/" className="auth-brand">
          <Image src={brandMark} alt="" width={28} height={28} />
          TrustLock
        </Link>
        <div className="auth-copy">
          <p className="auth-lead">Pay when the work is delivered. Get paid when it is approved.</p>
          <ExampleContract currency={currency} />
          <ul className="auth-points">
            {POINTS.map((t) => (
              <li key={t}>
                <Check size={18} weight="bold" aria-hidden="true" className="auth-check" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="auth-foot">
          Practice credits only. © 2026 TrustLock. <Link href="/privacy">Privacy</Link> <Link href="/terms">Terms</Link>
        </p>
      </aside>
      <section className="auth-main" aria-labelledby="auth-h">
        <Link href="/" className="auth-brand-mobile">
          TrustLock
        </Link>
        <h1 id="auth-h" className="sr-only">
          {title}
        </h1>
        {note}
        {children}
        <Link href="/" className="auth-back">
          <ArrowLeft size={16} weight="bold" aria-hidden="true" />
          Back to the home page
        </Link>
      </section>
    </main>
  );
}
