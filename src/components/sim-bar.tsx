import { setRegion, setTheme } from "@/app/actions";
import { currencyLabel } from "@/domain/money";
import { countryName, currencyForCountry, type Region } from "@/server/region";
import type { Theme } from "@/server/theme";
import { getT } from "@/i18n/server";
import { LangSwitch } from "@/components/lang-switch";
import type { Lang } from "@/server/lang";

const THEME_LABEL: Record<Theme, string> = { system: "Match my device", light: "Light", dark: "Dark" };

/**
 * The strip at the top of every page (NFR-7.4). Three buttons:
 * 1. "Simulation only" always shows the notice and opens the full explanation.
 * 2. The region menu shows the current country and currency and lists the others.
 * A third, icon only menu lets people pick light, dark or their device setting.
 * All are plain details and forms, so they work without scripts. PopoverDismiss closes them on an outside click.
 */
export async function SimBar({ region, countries, theme, lang }: { region: Region; countries: string[]; theme: Theme; lang: Lang }) {
  const t = await getT();
  return (
    <div className="sim" role="note">
      <details className="popper sim-menu">
        <summary>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9.5" />
            <path d="M12 11v5.5M12 7.6v.1" />
          </svg>
          <span>
            {t("Simulation only")}<span className="sim-long">{t(": no real money")}</span>
          </span>
          <span className="chev" aria-hidden="true" />
        </summary>
        <div className="sim-pop">
          <p>
            {t("No real money is used anywhere in TrustLock. Amounts in")} {currencyLabel(region.currency)} ({region.currency}{t(") are practice credits and are not converted.")}
          </p>
        </div>
      </details>

      <div className="sim-right">
      <details className="popper sim-menu sim-region">
        <summary>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9.5" />
            <path d="M2.5 12h19M12 2.5c2.8 2.8 4.2 6 4.2 9.5s-1.4 6.7-4.2 9.5c-2.8-2.8-4.2-6-4.2-9.5S9.2 5.3 12 2.5z" />
          </svg>
          <span className="sim-region-name">
            <span className="sr-only">{t("Region:")} </span>
            {countryName(region.country)} · {currencyLabel(region.currency)}
          </span>
          <span className="chev" aria-hidden="true" />
        </summary>
        <div className="sim-pop sim-pop-right" role="group" aria-label={t("Choose region")}>
          <form action={setRegion}>
            <button type="submit" name="country" value="auto" aria-current={region.source !== "choice" ? "true" : undefined}>
              <span>{t("Detect automatically")}</span>
              {region.source !== "choice" && <span className="here">{t("Current")}</span>}
            </button>
          </form>
          <form action={setRegion}>
            <ul>
              {countries.map((c) => (
                <li key={c}>
                  <button type="submit" name="country" value={c} aria-current={region.source === "choice" && region.country === c ? "true" : undefined}>
                    <span>{countryName(c)}</span>
                    <span className="cur">{currencyLabel(currencyForCountry(c))}</span>
                  </button>
                </li>
              ))}
            </ul>
          </form>
        </div>
      </details>
      <LangSwitch lang={lang} label={t("Choose language")} className="sim-lang" />
      <details className="popper sim-menu sim-theme">
        <summary aria-label={t("Theme: {theme}", { theme: t(THEME_LABEL[theme]) })}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
          </svg>
          <span className="chev" aria-hidden="true" />
        </summary>
        <div className="sim-pop sim-pop-right" role="group" aria-label={t("Choose theme")}>
          <form action={setTheme}>
            <ul>
              {(["system", "light", "dark"] as const).map((th) => (
                <li key={th}>
                  <button type="submit" name="theme" value={th} aria-current={theme === th ? "true" : undefined}>
                    <span>{t(THEME_LABEL[th])}</span>
                    {theme === th && <span className="here">{t("Current")}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </form>
        </div>
      </details>
      </div>
    </div>
  );
}
