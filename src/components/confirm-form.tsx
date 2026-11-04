"use client";

import { useId, useRef } from "react";
import { SubmitButton } from "./submit-button";

/**
 * A button that opens a confirmation dialog before an irreversible action (NFR-5.4).
 * The native <dialog> traps focus, closes on Escape and returns focus to the button.
 */
export function ConfirmForm({
  action,
  hidden,
  triggerLabel,
  title,
  confirmLabel,
  tone = "primary",
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  hidden: Record<string, string>;
  triggerLabel: string;
  title: string;
  confirmLabel: string;
  tone?: "primary" | "go" | "danger";
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const cls = tone === "go" ? "btn btn-go" : tone === "danger" ? "btn btn-danger" : "btn btn-primary";
  return (
    <>
      <button type="button" className={cls} onClick={() => ref.current?.showModal()}>
        {triggerLabel}
      </button>
      <dialog ref={ref} className="dialog" aria-labelledby={titleId}>
        <form action={action}>
          {Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <h2 id={titleId}>{title}</h2>
          <div className="small u-flex u-col u-gap-3">
            {children}
          </div>
          <div className="btn-row u-end">
            <button type="button" className="btn" onClick={() => ref.current?.close()}>
              Go back
            </button>
            <SubmitButton className={cls}>{confirmLabel}</SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
