import { getLang } from "@/server/lang";
import { makeT, type T } from "./core";
import { SW, SW_PATTERNS } from "./sw";

/** The translate function for the visitor's language. Use it in server pages and server actions: `const t = await getT();`. */
export async function getT(): Promise<T> {
  return (await getLang()) === "sw" ? makeT("sw", SW, SW_PATTERNS) : makeT("en");
}
