import { cookies } from "next/headers";

export const THEME_COOKIE = "tl_theme";
export type Theme = "system" | "light" | "dark";
export const THEMES: readonly Theme[] = ["system", "light", "dark"];

/** The visitor's own choice. Anything unknown means "follow the device setting". */
export async function getTheme(): Promise<Theme> {
  const v = (await cookies()).get(THEME_COOKIE)?.value;
  return v === "light" || v === "dark" ? v : "system";
}
