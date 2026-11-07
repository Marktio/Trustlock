"use client";

import { useRef } from "react";
import { useT } from "@/i18n/client";

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
  const t = useT();
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action} className="region-picker">
      <label htmlFor="region-select">{t("Region")}</label>
      <select id="region-select" name="country" defaultValue={value} onChange={() => form.current?.requestSubmit()}>
        <option value="auto">{t("Detect automatically")}</option>
        {options.map((o) => (
          <option key={o.country} value={o.country}>
            {o.label}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit">{t("Set")}</button>
      </noscript>
    </form>
  );
}
