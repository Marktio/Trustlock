/** Shown while a signed in page loads: the same sidebar and a page head, a pair of blocks and a few rows. */
export function PageSkeleton() {
  return (
    <div className="app" aria-busy="true">
      <aside className="side" aria-hidden="true">
        <span className="brand">TrustLock</span>
      </aside>
      <main id="main" className="main">
        <p className="sr-only" role="status">
          Loading
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
