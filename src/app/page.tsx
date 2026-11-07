import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { HowItWorks } from "@/components/how-it-works";
import { ExampleContract } from "@/components/example-contract";
import { TaglineReveal } from "@/components/tagline-reveal";
import { LangSwitch } from "@/components/lang-switch";
import { ProductPreview, SectionHead } from "@/components/product-preview";
import { CONTACT_EMAIL } from "@/components/legal";
import { LANDING } from "@/i18n/landing";
import { Pill } from "@/components/ui";
import { getViewer, clerkEnabled } from "@/server/auth";
import { getLang } from "@/server/lang";
import { getRegion } from "@/server/region";
import brandMark from "./icon.svg";

const PEOPLE = [
  { name: "Queen", initials: "Q", photo: null as string | null },
  { name: "Daniel Nab", initials: "DN", photo: null as string | null },
];

export default async function Landing() {
  const viewer = await getViewer();
  const { currency } = await getRegion();
  const lang = await getLang();
  const c = LANDING[lang];
  const startAs = (role: "client" | "freelancer") => (clerkEnabled ? `/sign-up?role=${role}` : `/demo?role=${role}`);
  const dashboardHref = viewer?.role === "admin" ? "/admin" : viewer?.role === "auditor" ? "/audit" : "/dashboard";
  const slash = (label: string) => (
    <>
      <span className="lp-slash" aria-hidden="true">
        /
      </span>
      {label}
    </>
  );
  return (
    <div className="landing" lang={lang}>
      <header className="lp-header">
        <div className="lp-nav">
          <Link href="/" className="lp-brand" lang="en">
            <Image src={brandMark} alt="" width={28} height={28} priority />
            TrustLock
          </Link>
          <nav aria-label="Page sections" className="lp-links">
            <HowItWorks className="lp-link" label={slash(c.navHow)} />
            <a href="#roles" className="lp-link">
              {slash(c.navRoles)}
            </a>
          </nav>
          <LangSwitch lang={lang} label={c.languageLabel} className="lp-lang-nav" />
          {viewer ? (
            <Link className="lp-btn lp-btn-sm lp-btn-solid" href={dashboardHref}>
              {c.openDashboard}
            </Link>
          ) : (
            <Link className="lp-btn lp-btn-sm lp-btn-quiet" href={clerkEnabled ? "/sign-in" : "/demo"}>
              {c.login}
            </Link>
          )}
        </div>
      </header>

      <main id="main">
        <section className="lp-hero" aria-labelledby="hero-h">
          <div className="lp-copy">
            <p className="caption-1 lp-eyebrow">{c.eyebrow}</p>
            <h1 id="hero-h" className="lp-title">
              <span>{c.h1a}</span> <span>{c.h1b}</span>
            </h1>
            <p className="body-7 lp-lead">{c.lead}</p>
            <div className="lp-actions">
              <Link className="lp-btn lp-btn-md lp-btn-solid" href={startAs("client")}>
                {c.regClient}
              </Link>
              <Link className="lp-btn lp-btn-md lp-btn-text" href={startAs("freelancer")}>
                {c.regFreelancer}
                <ArrowRight size={16} weight="bold" aria-hidden="true" />
              </Link>
            </div>
            {!clerkEnabled && <p className="caption-2 lp-note">{c.demoNote}</p>}
          </div>

          <div lang="en" className="u-contents">
            <ExampleContract currency={currency} />
          </div>
        </section>

        <ProductPreview copy={c} />

        <section id="how" className="lp-how" aria-labelledby="how-h">
          <SectionHead num="02" id="how-h" title={c.howTitle} />
          <ol className="lp-how-list">
            {c.steps.map((st, i) => (
              <li key={st.title}>
                <div>
                  <h3 className="heading-6">{st.title}</h3>
                  <p className="body-3 lp-muted">{st.body}</p>
                </div>
                <span lang="en">
                  <Pill state={(["funded", "delivered", "completed"] as const)[i]} />
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="lp-tagline-wrap" aria-label="In short">
          <TaglineReveal text={c.tagline} />
        </section>

        <section id="roles" className="lp-roles" aria-labelledby="roles-h">
          <SectionHead num="03" id="roles-h" title={c.rolesTitle} />
          <div className="lp-roles-body">
            {c.roles.map((r, i) => (
              <div key={r.title} className={`lp-role${i === 2 ? " lp-role-wide" : ""}`}>
                <h3 className="heading-6">{r.title}</h3>
                <p className="body-3 lp-muted">{r.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-built" aria-labelledby="built-h">
          <SectionHead num="04" id="built-h" title={c.builtTitle} />
          <div className="lp-built-body">
            <ul className="lp-people">
              {PEOPLE.map((p) => (
                <li key={p.name} className="lp-person">
                  {p.photo ? (
                    <Image src={p.photo} alt="" width={64} height={64} className="lp-avatar" />
                  ) : (
                    <span className="lp-avatar" aria-hidden="true">
                      {p.initials}
                    </span>
                  )}
                  <span className="title-3">{p.name}</span>
                </li>
              ))}
            </ul>
            <p className="body-3 lp-muted">{c.builtBody}</p>
          </div>
        </section>

        <section id="contact" className="lp-talk" aria-labelledby="talk-h">
          <SectionHead num="05" id="talk-h" title={c.talkTitle} />
          <div className="lp-talk-body">
            <p className="body-3 lp-muted">{c.talkBody}</p>
            <a className="lp-mail" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
              <ArrowUpRight size={20} weight="bold" aria-hidden="true" />
            </a>
          </div>
        </section>
      </main>

      <footer className="lp-footer caption-2">
        <p>{c.footer}</p>
        <div className="lp-foot-right">
          <nav className="lp-legal" aria-label="Legal">
            <Link href="/privacy" hrefLang="en">
              {c.privacy}
            </Link>
            <Link href="/terms" hrefLang="en">
              {c.terms}
            </Link>
          </nav>
          <LangSwitch lang={lang} label={c.languageLabel} />
        </div>
        {c.legalNote && <p className="lp-legal-note">{c.legalNote}</p>}
      </footer>
    </div>
  );
}
