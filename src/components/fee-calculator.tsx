"use client";

import { useId, useState } from "react";
import { feeFor, formatSC, scToMinor } from "@/domain/money";

export type FeeCalcCopy = {
  amountLabel: string;
  hint: string;
  invalid: string;
  fundsLabel: string;
  feeLabel: string;
  receivesLabel: string;
  note: string;
};

/**
 * Landing page fee calculator. It uses the same integer money functions and the same default fee
 * as the escrow service, so the numbers shown here are the numbers a real contract would produce.
 */
export function FeeCalculator({ currency, feeBps, copy }: { currency: string; feeBps: number; copy: FeeCalcCopy }) {
  const id = useId();
  const [text, setText] = useState("15000");
  let result: { funds: number; fee: number; receives: number } | null = null;
  try {
    const funds = scToMinor(text);
    if (funds > 0) {
      const fee = feeFor(funds, feeBps);
      result = { funds, fee, receives: funds - fee };
    }
  } catch {
    result = null;
  }
  const pct = `${feeBps / 100}%`;
  return (
    <div className="lp-calc">
      <div className="field lp-calc-field">
        <label htmlFor={id}>{copy.amountLabel}</label>
        <input id={id} type="text" inputMode="decimal" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} aria-describedby={`${id}-hint`} aria-invalid={result ? undefined : true} />
        <p id={`${id}-hint`} className="hint">{result ? copy.hint : copy.invalid}</p>
      </div>
      <dl className="lp-calc-out" aria-live="polite">
        <div>
          <dt>{copy.fundsLabel}</dt>
          <dd>{result ? formatSC(result.funds, true, currency) : "-"}</dd>
        </div>
        <div>
          <dt>{copy.feeLabel.replace("{pct}", pct)}</dt>
          <dd>{result ? formatSC(result.fee, true, currency) : "-"}</dd>
        </div>
        <div className="lp-calc-total">
          <dt>{copy.receivesLabel}</dt>
          <dd>{result ? formatSC(result.receives, true, currency) : "-"}</dd>
        </div>
      </dl>
      <p className="caption-2 lp-muted lp-calc-note">{copy.note}</p>
    </div>
  );
}
