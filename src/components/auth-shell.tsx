import Link from "next/link";

const POINTS = [
  "The client's payment is locked until the work is approved",
  "The freelancer is paid exactly once, on approval",
  "Every step goes into a log nobody can quietly edit",
];

/** A drawn picture of the idea: the client's money waits in a vault and moves to the freelancer only on approval. */
function EscrowIllustration() {
  return (
    <svg className="auth-art" viewBox="0 0 520 250" role="img" aria-label="Money moves from the client into escrow and is released to the freelancer after approval">
      <defs>
        <marker id="arrow" markerWidth="9" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0 0 L9 4 L0 8 z" fill="#e9a824" />
        </marker>
      </defs>
      {/* client */}
      <g>
        <rect x="8" y="70" width="120" height="110" rx="14" fill="#1c2b50" stroke="#2f4378" />
        <circle cx="68" cy="108" r="16" fill="#a9b6d6" />
        <path d="M38 158c3-16 15-24 30-24s27 8 30 24" fill="#a9b6d6" />
        <text x="68" y="198" textAnchor="middle" fontSize="15" fill="#fff" fontFamily="system-ui, sans-serif">Client</text>
      </g>
      {/* vault */}
      <g>
        <rect x="196" y="40" width="128" height="140" rx="16" fill="#1c2b50" stroke="#e9a824" strokeWidth="2.5" />
        <path d="M232 98V84a28 28 0 0 1 56 0v14" fill="none" stroke="#e9a824" strokeWidth="9" strokeLinecap="round" />
        <rect x="222" y="96" width="76" height="58" rx="10" fill="#e9a824" />
        <circle cx="260" cy="122" r="7.5" fill="#111b33" />
        <rect x="256" y="124" width="8" height="18" rx="4" fill="#111b33" />
        <text x="260" y="198" textAnchor="middle" fontSize="15" fill="#fff" fontFamily="system-ui, sans-serif">Escrow</text>
      </g>
      {/* freelancer */}
      <g>
        <rect x="392" y="70" width="120" height="110" rx="14" fill="#1c2b50" stroke="#2f4378" />
        <circle cx="452" cy="108" r="16" fill="#a9b6d6" />
        <path d="M422 158c3-16 15-24 30-24s27 8 30 24" fill="#a9b6d6" />
        <text x="452" y="198" textAnchor="middle" fontSize="15" fill="#fff" fontFamily="system-ui, sans-serif">Freelancer</text>
      </g>
      {/* flows */}
      <path d="M132 125h58" stroke="#e9a824" strokeWidth="3" strokeLinecap="round" markerEnd="url(#arrow)" />
      <path d="M328 125h58" stroke="#e9a824" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 7" markerEnd="url(#arrow)" />
      <text x="161" y="108" textAnchor="middle" fontSize="12.5" fill="#a9b6d6" fontFamily="system-ui, sans-serif">Funds</text>
      <text x="357" y="108" textAnchor="middle" fontSize="12.5" fill="#a9b6d6" fontFamily="system-ui, sans-serif">Approved</text>
      {/* ledger tick */}
      <g transform="translate(150 216)">
        <rect width="220" height="28" rx="14" fill="#15664a" />
        <path d="M18 14l5 5 9-10" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <text x="42" y="19" fontSize="13" fill="#fff" fontFamily="system-ui, sans-serif">Ledger balanced · audit intact</text>
      </g>
    </svg>
  );
}

/** The split screen around Clerk's sign-in and sign-up forms: the idea on the left, the form on the right. */
export function AuthShell({ title, note, children }: { title: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <main id="main" className="auth">
      <aside className="auth-aside" aria-label="About TrustLock">
        <Link href="/" className="auth-brand">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--amber-400)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" />
            <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
          </svg>
          TrustLock
        </Link>
        <div className="auth-copy">
          <p className="auth-lead">Pay when the work is delivered. Get paid when it is approved.</p>
          <EscrowIllustration />
          <ul className="auth-points">
            {POINTS.map((t) => (
              <li key={t}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--amber-400)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="auth-foot">Practice credits only. Group 11 · SWE3020B</p>
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
          ← Back to the home page
        </Link>
      </section>
    </main>
  );
}
