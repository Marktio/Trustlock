import { getT } from "@/i18n/server";
/** Shown while a signed in page loads: the same sidebar and a page head, a pair of blocks and a few rows. */
export async function PageSkeleton() {
  const t = await getT();
  return (
    <div className="app" aria-busy="true">
      <aside className="side" aria-hidden="true">
        <span className="brand">{t("TrustLock")}</span>
      </aside>
      <main id="main" className="main">
        <p className="sr-only" role="status">
          {t("Loading")}
        </p>
        <div className="skel skel-title" />
        <div className="grid-2" aria-hidden="true">
          <div className="skel skel-block" />
          <div className="skel skel-block" />
        </div>
        <div aria-hidden="true" className="u-flex u-col u-gap-3">
          <div className="skel skel-line" />
          <div className="skel skel-line" />
          <div className="skel skel-line" />
        </div>
      </main>
    </div>
  );
}
