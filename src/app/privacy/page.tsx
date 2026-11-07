import { COMPANY, CONTACT_EMAIL, LegalPage, Section } from "@/components/legal";

export const metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      intro={`${COMPANY} is a practice escrow simulator. This page explains what we collect, why, who else handles it, and what you can ask us to do.`}
    >
      <Section id="collect" title="What we collect">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Data</th>
              <th scope="col">Why we keep it</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Name, email address and role</td>
              <td>To sign you in and show who did what on a contract. Handled by our sign in provider, Clerk.</td>
            </tr>
            <tr>
              <td>Contracts, milestones and messages</td>
              <td>To run the escrow flow between the client and the freelancer.</td>
            </tr>
            <tr>
              <td>Evidence files</td>
              <td>We keep only the file name, size and a SHA-256 fingerprint. The file contents are not stored.</td>
            </tr>
            <tr>
              <td>Wallet, ledger and notifications</td>
              <td>To show practice credit balances and every movement of them. Simulated emails are kept in a mail catcher for administrators.</td>
            </tr>
            <tr>
              <td>Audit log</td>
              <td>To keep a record of each action, who took it and when.</td>
            </tr>
          </tbody>
        </table>
        <p>We do not collect payment card details, bank details or government ID numbers. No real money is used.</p>
      </Section>

      <Section id="cookies" title="Cookies">
        <ul>
          <li>A session cookie from Clerk keeps you signed in.</li>
          <li>A cookie named tl_lang remembers your language choice for one year.</li>
          <li>A cookie named tl_region remembers your country and currency for one year.</li>
          <li>A cookie named tl_theme remembers if you chose light or dark, for one year.</li>
          <li>In demo mode, a cookie named tl_demo_user remembers which demo account you picked.</li>
        </ul>
        <p>We do not use advertising or tracking cookies.</p>
      </Section>

      <Section id="processors" title="Who else handles your data">
        <p>We use three service providers. Each handles data only to run TrustLock for us.</p>
        <ul>
          <li>Clerk, for sign in and account management.</li>
          <li>Supabase, for the database.</li>
          <li>Vercel, for hosting.</li>
        </ul>
        <p>These providers may process data on servers outside Kenya. We do not sell your data.</p>
      </Section>

      <Section id="retention" title="How long we keep it">
        <p>
          The ledger and the audit log can only be added to, never edited, so entries stay for seven years even after an account is deactivated. When you
          deactivate your account we remove your sign in, but your name stays in those entries so the record remains complete. Practice data may also be
          reset at any time.
        </p>
      </Section>

      <Section id="rights" title="Your rights">
        <p>
          Under the Kenya Data Protection Act 2019 you can ask to see the data we hold about you, correct it, or ask us to stop using it. Some records cannot
          be erased because they are part of the permanent ledger and audit log described above. Email us at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we will reply within 30 days. If you are unhappy with our answer you can complain to the
          Office of the Data Protection Commissioner of Kenya.
        </p>
      </Section>

      <Section id="security" title="Security">
        <p>
          Access to each page is checked on the server against your role. Data is sent over encrypted connections. No system is perfectly secure, so please do
          not put real personal or financial information into practice contracts.
        </p>
      </Section>

      <Section id="age" title="Age">
        <p>TrustLock is for people aged 18 and over. If you believe someone under 18 has signed up, email us and we will remove the account.</p>
      </Section>

      <Section id="contact" title="Contact">
        <p>
          Questions about this policy go to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </Section>
    </LegalPage>
  );
}
