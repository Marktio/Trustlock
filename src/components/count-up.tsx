"use client";

import { useEffect, useState } from "react";

const NUMBER = /\d[\d,]*(?:\.\d+)?/;
// Remembered only once an animation has finished, so a re-run of the effect (React strict mode) cannot cancel it and then skip it.
const wasSeen = (key: string) => {
  try {
    return sessionStorage.getItem(key) !== null;
  } catch {
    return false; // storage blocked: animate every time, which is harmless
  }
};
const markSeen = (key: string) => {
  try {
    sessionStorage.setItem(key, "1");
  } catch {
    /* ignore */
  }
};

/**
 * Counts a formatted amount up from zero when it first appears. The server sends the finished text, so without scripting,
 * with reduced motion, or for an amount already shown this session, the final value is simply there.
 * Only the first number in the text moves (the "KSh " or other unit around it stays put). Text with a grouping style
 * this does not recognise is left alone rather than shown wrongly.
 */
export function CountUp({ text, ms = 800 }: { text: string; ms?: number }) {
  // The text being animated and its current frame. A frame for an older text is ignored, so a new amount shows at once.
  const [frame, setFrame] = useState<{ of: string; value: string } | null>(null);

  useEffect(() => {
    const m = NUMBER.exec(text);
    if (!m || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const raw = m[0];
    const target = Number(raw.replace(/,/g, ""));
    const decimals = raw.includes(".") ? raw.split(".")[1]!.length : 0;
    if (!Number.isFinite(target) || target === 0 || (!raw.includes(",") && target >= 1000) || wasSeen(`tl-count:${text}`)) return;

    const fmt = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    const before = text.slice(0, m.index);
    const after = text.slice(m.index + raw.length);
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      const eased = 1 - (1 - p) ** 3;
      setFrame(p < 1 ? { of: text, value: `${before}${fmt(target * eased)}${after}` } : null);
      if (p < 1) raf = requestAnimationFrame(tick);
      else markSeen(`tl-count:${text}`);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, ms]);

  return <>{frame?.of === text ? frame.value : text}</>;
}
