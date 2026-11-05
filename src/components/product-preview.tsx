import Image from "next/image";
import contractLight from "@/assets/shots/contract-light.webp";
import contractDark from "@/assets/shots/contract-dark.webp";
import reviewLight from "@/assets/shots/review-light.webp";
import reviewDark from "@/assets/shots/review-dark.webp";
import auditLight from "@/assets/shots/audit-light.webp";
import auditDark from "@/assets/shots/audit-dark.webp";

const SHOTS = [
  {
    title: "Funds are held, not spent",
    body: "Once the client funds a contract, the money sits in escrow. Neither side can spend it until the work is approved.",
    light: contractLight,
    dark: contractDark,
    alt: "A TrustLock contract page for a brand identity project. It shows KSh 45,000 held in escrow, the steps from draft to completed, and a timeline of what has happened.",
  },
  {
    title: "One clear next step",
    body: "Each person sees what they need to do now. When work is delivered, the client reviews it. If they say nothing, approval happens by itself after the review period.",
    light: reviewLight,
    dark: reviewDark,
    alt: "A TrustLock contract page for website copywriting. The work is delivered, and the client is shown a Review delivery button with the time left before automatic approval.",
  },
  {
    title: "A record nobody can quietly edit",
    body: "Every action is added to an audit log. Each entry carries the fingerprint of the one before it, so a change anywhere breaks the chain.",
    light: auditLight,
    dark: auditDark,
    alt: "The TrustLock audit log. A ledger reconciliation card shows the ledger is balanced, above a table of actions with the actor, result and fingerprint of each entry.",
  },
];

/** Real screens from the demo, in the visitor's own theme. Both versions are in the page, and CSS shows the one that matches. */
export function ProductPreview() {
  return (
    <section className="lp-shots" aria-labelledby="shots-h">
      <h2 id="shots-h" className="heading-4 lp-section-title">
        See it in use
      </h2>
      <ol className="lp-shot-list">
        {SHOTS.map((s) => (
          <li key={s.title} className="lp-shot">
            <div className="lp-shot-copy">
              <h3 className="title-3">{s.title}</h3>
              <p className="body-2">{s.body}</p>
            </div>
            <div className="lp-shot-frame">
              <Image className="lp-shot-light" src={s.light} alt={s.alt} sizes="(min-width: 960px) 700px, 100vw" />
              <Image className="lp-shot-dark" src={s.dark} alt={s.alt} sizes="(min-width: 960px) 700px, 100vw" />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
