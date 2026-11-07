"use client";

import { createContext, useContext, useMemo } from "react";
import { makeT, type Dict, type T } from "./core";
import type { Lang } from "@/server/lang";

const Ctx = createContext<T>(makeT("en"));

/** Gives browser components the translate function. The dictionary is only sent to the browser when the language is Kiswahili. */
export function I18nProvider({ lang, dict, children }: { lang: Lang; dict?: Dict; children: React.ReactNode }) {
  const t = useMemo(() => makeT(lang, dict), [lang, dict]);
  return <Ctx.Provider value={t}>{children}</Ctx.Provider>;
}

/** In a browser component: `const t = useT();`. */
export function useT(): T {
  return useContext(Ctx);
}
