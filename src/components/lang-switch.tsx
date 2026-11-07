import { setLang } from "@/app/actions";
import type { Lang } from "@/server/lang";

const OPTIONS: { code: Lang; label: string; name: string }[] = [
  { code: "en", label: "EN", name: "English" },
  { code: "sw", label: "SW", name: "Kiswahili" },
];

/** Two buttons in a form, so the choice works without scripting. The choice is kept in a cookie. */
export function LangSwitch({ lang, label, className = "" }: { lang: Lang; label: string; className?: string }) {
  return (
    <form action={setLang} className={className}>
      <div role="group" aria-label={label} className="lp-lang">
        {OPTIONS.map((o) => (
          <button key={o.code} type="submit" name="lang" value={o.code} aria-pressed={lang === o.code} aria-label={`${o.label} ${o.name}`} lang={o.code}>
            {o.label}
          </button>
        ))}
      </div>
    </form>
  );
}
