"use client";

import { useId, useRef } from "react";
import { SubmitButton } from "./submit-button";

/** Opens the simulated top-up / withdraw form in a dialog (S13). Errors come back as a notice on the page. */
export function MoneyDialog({
  action,
  idemKey,
  triggerLabel,
  title,
  submitLabel,
  hint,
  unit,
}: {
  action: (formData: FormData) => void | Promise<void>;
  idemKey: string;
  triggerLabel: string;
  title: string;
  submitLabel: string;
  hint: string;
  unit: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => ref.current?.showModal()}>
        {triggerLabel}
      </button>
      <dialog ref={ref} className="dialog" aria-labelledby={titleId}>
        <form action={action}>
          <input type="hidden" name="key" value={idemKey} />
          <h2 id={titleId}>{title}</h2>
          <div className="field">
            <label htmlFor="amount">Amount ({unit})</label>
            <input id="amount" name="amount" type="text" inputMode="decimal" required autoComplete="off" />
            <span className="hint">{hint}</span>
          </div>
          <div className="btn-row u-end">
            <button type="button" className="btn" onClick={() => ref.current?.close()}>
              Cancel
            </button>
            <SubmitButton pendingLabel="Processing…">{submitLabel}</SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
