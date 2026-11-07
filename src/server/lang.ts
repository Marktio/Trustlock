import { cookies } from "next/headers";

export const LANG_COOKIE = "tl_lang";
export type Lang = "en" | "sw";

/** The language chosen for the home page copy. Anything unknown means English. */
export async function getLang(): Promise<Lang> {
  return (await cookies()).get(LANG_COOKIE)?.value === "sw" ? "sw" : "en";
}
