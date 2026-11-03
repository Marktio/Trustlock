"use client";

import { useEffect } from "react";

/** Closes any open popover menu (a details element with the "popper" class) on an outside click or Escape, and gives focus back on Escape. */
export function PopoverDismiss() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      document.querySelectorAll<HTMLDetailsElement>("details.popper[open]").forEach((d) => {
        if (!d.contains(e.target as Node)) d.removeAttribute("open");
      });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const open = document.querySelector<HTMLDetailsElement>("details.popper[open]");
      if (!open) return;
      open.removeAttribute("open");
      open.querySelector<HTMLElement>("summary")?.focus();
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  return null;
}
