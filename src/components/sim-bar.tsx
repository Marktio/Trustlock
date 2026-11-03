import { setRegion } from "@/app/actions";
import { currencyLabel } from "@/domain/money";
import { countryName, currencyForCountry, type Region } from "@/server/region";

/**
 * The strip at the top of every page (NFR-7.4). Two buttons:
 * 1. "Simulation only" always shows the notice and opens the full explanation.
 * 2. The region menu shows the current country and currency and lists the others.
 * Both are plain details and forms, so they work without scripts. PopoverDismiss closes them on an outside click.
 */
export function SimBar({ region, countries }: { region: Region; countries: string[] }) {
  return (
    <div className="sim" role="note">
      <details className="popper sim-menu">
        <summary>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9.5" />
            <path d="M12 11v5.5M12 7.6v.1" />
          </svg>
          <span>
            Simulation only<span className="sim-long">: no real money</span>
          </span>
          <span className="chev" aria-hidden="true" />
        </summary>
        <div className="sim-pop">
          <p>
            No real money is used anywhere in TrustLock. Amounts in {currencyLabel(region.currency)} ({region.currency}) are practice credits and are not converted.
          </p>
        </div>
      </details>

      <details className="popper sim-menu sim-region">
        <summary>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9.5" />
            <path d="M2.5 12h19M12 2.5c2.8 2.8 4.2 6 4.2 9.5s-1.4 6.7-4.2 9.5c-2.8-2.8-4.2-6-4.2-9.5S9.2 5.3 12 2.5z" />
          </svg>
          <span className="sim-region-name">
            <span className="sr-only">Region: </span>
            {countryName(region.country)} · {currencyLabel(region.currency)}
          </span>
          <span className="chev" aria-hidden="true" />
        </summary>
        <div className="sim-pop sim-pop-right" role="group" aria-label="Choose region">
          <form action={setRegion}>
            <button type="submit" name="country" value="auto" aria-current={region.source !== "choice" ? "true" : undefined}>
              <span>Detect automatically</span>
              {region.source !== "choice" && <span className="here">Current</span>}
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
    </div>
  );
}
