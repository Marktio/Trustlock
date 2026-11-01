"use client";

import { useFormStatus } from "react-dom";

/** Disables itself while the request runs, so a double click cannot send the action twice. */
export function SubmitButton({
  children,
  pendingLabel = "Working…",
  className = "btn btn-primary",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
