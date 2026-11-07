"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useT } from "@/i18n/client";

/** Something threw while rendering. Say what happened and what to do, never show the raw error. */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useT();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="err">
      <h1>{t("This page could not load")}</h1>
      <p>{t("Something went wrong on our side. Your data was not changed. Try again, and if it keeps happening, go back to the home page.")}</p>
      <div className="btn-row">
        <button type="button" className="btn btn-primary" onClick={() => retry()}>
          {t("Try again")}
        </button>
        <Link className="btn" href="/">
          {t("Home page")}
        </Link>
      </div>
    </main>
  );
}
