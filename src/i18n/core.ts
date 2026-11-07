import type { Lang } from "@/server/lang";

export type Vars = Record<string, string | number>;
export type Dict = Readonly<Record<string, string>>;
/** A sentence whose words change from case to case. The first item is a whole-text regular expression, the second uses $1, $2 for its groups. */
export type Pattern = readonly [RegExp, string];

export interface T {
  (text: string, vars?: Vars): string;
  readonly lang: Lang;
}

export function interpolate(text: string, vars?: Vars): string {
  return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text;
}

/**
 * Builds the translate function. The English sentence is the key, so a sentence nobody has translated yet simply shows in English
 * (and the page never breaks). Looks in the dictionary first, then in the patterns for sentences with names and numbers in them.
 * Placeholders look like {name}.
 */
export function makeT(lang: Lang, dict?: Dict | null, patterns: readonly Pattern[] = []): T {
  const t = ((text: string, vars?: Vars) => {
    if (lang === "en") return interpolate(text, vars);
    const hit = dict?.[text];
    if (hit) return interpolate(hit, vars);
    const plain = interpolate(text, vars);
    for (const [re, out] of patterns) {
      if (re.test(plain)) return plain.replace(re, out);
    }
    return plain;
  }) as T;
  Object.defineProperty(t, "lang", { value: lang });
  return t;
}
