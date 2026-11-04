import Link from "next/link";
import { COMPANY, CONTACT_EMAIL, LegalPage, Section } from "@/components/legal";

export const metadata = { title: "Terms of use" };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      intro={`These terms apply when you use ${COMPANY}. By creating an account or using the site you agree to them.`}
    >
      <Section id="simulation" title="1. TrustLock is a simulation">
        <p>
          TrustLock uses practice credits only. They have no cash value, cannot be bought, withdrawn or exchanged, and nothing here moves real money. TrustLock
          is a practice tool. It does not offer banking or payment services, is not a licensed escrow provider, and does not hold real funds for anyone.
        </p>
      </Section>

      <Section id="account" title="2. Your account">
        <p>
          You must be 18 or over. Give accurate details, keep your sign in secure, and tell us if you think someone else has used your account. You are
          responsible for what is done through it.
        </p>
      </Section>

      <Section id="flow" title="3. How a contract works">
        <p>
          A client creates a contract and locks practice credits. The freelancer delivers the work. When the client approves, the freelancer is paid once. If
          the two sides disagree, either can raise a dispute.
        </p>
      </Section>

      <Section id="disputes" title="4. Disputes">
        <p>An arbitrator reviews the evidence and decides the outcome. Their decision is final within TrustLock and is applied to the practice credits automatically.</p>
      </Section>

      <Section id="record" title="5. The permanent record">
        <p>
          Every step is written to a ledger and an audit log that cannot be edited. Entries are not removed when you deactivate your account. See the{" "}
          <Link href="/privacy">privacy policy</Link> for how long they are kept.
        </p>
      </Section>

      <Section id="use" title="6. Acceptable use">
        <p>Do not:</p>
        <ul>
          <li>use TrustLock to carry out a real payment or to deceive anyone about one;</li>
          <li>upload unlawful, abusive or infringing material;</li>
          <li>try to access another person&apos;s account or data;</li>
          <li>overload, scrape or interfere with the service.</li>
        </ul>
        <p>Testing in good faith with accounts you own or have been given is welcome. If you find a security problem, please report it to us instead of using it.</p>
      </Section>

      <Section id="availability" title="7. Availability and resets">
        <p>TrustLock is provided as is. It may be unavailable at times, and practice data, including balances and contracts, may be reset without notice.</p>
      </Section>

      <Section id="liability" title="8. Our responsibility">
        <p>
          Because nothing of real value is held, we are not liable for losses linked to practice credits or practice data. Nothing in these terms limits any
          right you have under Kenyan law that cannot be limited.
        </p>
      </Section>

      <Section id="law" title="9. Governing law and contact">
        <p>
          These terms are governed by the laws of Kenya. Questions go to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We may update these terms, and
          the date at the top shows when they last changed.
        </p>
      </Section>
    </LegalPage>
  );
}
