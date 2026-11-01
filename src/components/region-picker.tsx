"use client";

import { useRef } from "react";

export interface RegionOption {
  country: string;
  label: string;
}

/** Lets a visitor override the detected region. Submits as soon as the choice changes. */
export function RegionPicker({
  action,
  options,
  value,
}: {
  action: (formData: FormData) => void | Promise<void>;
  options: RegionOption[];
  /** "auto" when nothing has been chosen yet. */
  value: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action} className="region-picker">
      <label htmlFor="region-select">Region</label>
      <select id="region-select" name="country" defaultValue={value} onChange={() => form.current?.requestSubmit()}>
        <option value="auto">Detect automatically</option>
        {options.map((o) => (
          <option key={o.country} value={o.country}>
            {o.label}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit">Set</button>
      </noscript>
    </form>
  );
}
