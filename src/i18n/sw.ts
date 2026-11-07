import type { Dict, Pattern } from "./core";
import ui from "./sw-ui.json";
import domain from "./sw-domain.json";

/** Kiswahili. Every key is the English sentence. A sentence missing here shows in English. */
export const SW: Dict = { ...(ui as Record<string, string>), ...(domain.dict as Record<string, string>) };

/** Sentences with names or numbers in them, written as [regex source, replacement]. */
export const SW_PATTERNS: readonly Pattern[] = (domain.patterns as [string, string][]).map(([src, out]) => [new RegExp(src, "s"), out] as const);
