import Image from "next/image";
import contractLight from "@/assets/shots/contract-light.webp";
import contractDark from "@/assets/shots/contract-dark.webp";
import reviewLight from "@/assets/shots/review-light.webp";
import reviewDark from "@/assets/shots/review-dark.webp";
import disputeLight from "@/assets/shots/dispute-light.webp";
import disputeDark from "@/assets/shots/dispute-dark.webp";
import auditLight from "@/assets/shots/audit-light.webp";
import auditDark from "@/assets/shots/audit-dark.webp";
import type { Copy } from "@/i18n/landing";

const IMAGES = [
  { light: contractLight, dark: contractDark },
  { light: reviewLight, dark: reviewDark },
  { light: disputeLight, dark: disputeDark },
  { light: auditLight, dark: auditDark },
];

/** Real screens from the demo, in the visitor's own theme. Both versions are in the page, and CSS shows the one that matches. */
export function ProductPreview({ copy }: { copy: Copy }) {
  return (
    <section id="examples" className="lp-shots" aria-labelledby="shots-h">
      <SectionHead num="01" id="shots-h" title={copy.previewTitle} />
      <ol className="lp-shot-list">
        {copy.examples.map((s, i) => (
          <li key={s.contract} className="lp-shot">
            <div className="lp-shot-copy">
              <p className="lp-case caption-3">
                {copy.exampleWord} {i + 1} <span aria-hidden="true">/</span> <span lang="en">{s.contract}</span>
              </p>
              <h3 className="title-3">{s.title}</h3>
              <p className="body-2">{s.body}</p>
            </div>
            <div className="lp-shot-frame" lang="en">
              <Image className="lp-shot-light" src={IMAGES[i].light} alt={s.alt} sizes="(min-width: 960px) 700px, 100vw" />
              <Image className="lp-shot-dark" src={IMAGES[i].dark} alt={s.alt} sizes="(min-width: 960px) 700px, 100vw" />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** A section title with its number above it. The number is decoration, so screen readers skip it. */
export function SectionHead({ num, id, title }: { num: string; id: string; title: string }) {
  return (
    <div className="lp-head">
      <p className="lp-num caption-3" aria-hidden="true">
        {num}
      </p>
      <h2 id={id} className="heading-4 lp-section-title">
        {title}
      </h2>
    </div>
  );
}
