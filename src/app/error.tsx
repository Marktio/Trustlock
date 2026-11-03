"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Something threw while rendering. Say what happened and what to do, never show the raw error. */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="err">
      <h1>This page could not load</h1>
      <p>Something went wrong on our side. Your data was not changed. Try again, and if it keeps happening, go back to the home page.</p>
      <div className="btn-row">
        <button type="button" className="btn btn-primary" onClick={() => retry()}>
          Try again
        </button>
        <Link className="btn" href="/">
          Home page
        </Link>
      </div>
    </main>
  );
}
