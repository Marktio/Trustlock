"use client";

import { useEffect, useRef } from "react";

/**
 * One large statement whose words go from muted to full colour, one at a time, as they cross a line
 * two thirds of the way down the screen. It tells the core promise in the order a reader meets it.
 * Without scripting, or with reduced motion, the text is simply shown in full colour.
 */
export function TaglineReveal({ text, id }: { text: string; id?: string }) {
  const root = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const words = Array.from(root.current?.querySelectorAll<HTMLElement>("[data-w]") ?? []);
    const seen = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting || e.boundingClientRect.top < 0) {
            (e.target as HTMLElement).dataset.on = "1";
            seen.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -35% 0px" },
    );
    root.current?.setAttribute("data-armed", "");
    words.forEach((w) => seen.observe(w));
    return () => {
      seen.disconnect();
      root.current?.removeAttribute("data-armed");
    };
  }, []);

  return (
    <p ref={root} id={id} className="lp-tagline">
      {text.split(" ").map((w, i) => (
        <span key={i} data-w="">
          {w}{" "}
        </span>
      ))}
    </p>
  );
}
