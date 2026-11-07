import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeT } from "./core";
import { ACTION_LABEL } from "@/components/format";
import { HOW_STEPS, RAIL_LABELS } from "@/components/how-steps";
import { STATE_LABEL } from "@/domain/states";
import { SW, SW_PATTERNS } from "./sw";

const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");

describe("Kiswahili dictionary [NFR-5.2]", () => {
  it("keeps every {placeholder} of the English sentence", () => {
    const bad = Object.entries(SW).filter(([en, sw]) => holes(en) !== holes(sw));
    expect(bad).toEqual([]);
  });

  it("has no empty or untranslated-identical long sentences", () => {
    const same = Object.entries(SW).filter(([en, sw]) => en.length > 40 && en === sw);
    expect(same).toEqual([]);
  });

  it("compiles every pattern and keeps its capture groups in the output", () => {
    for (const [re, out] of SW_PATTERNS) {
      const groups = new RegExp(`${re.source}|`).exec("")!.length - 1;
      const used = [...out.matchAll(/\$(\d)/g)].map((m) => Number(m[1]));
      for (const n of used) expect(n).toBeLessThanOrEqual(groups);
    }
  });

  it("translates a static message, a patterned message, and falls back to English", () => {
    const t = makeT("sw", SW, SW_PATTERNS);
    expect(t("Draft")).toBe("Rasimu");
    expect(t("Waiting for Amina to fund")).toBe("Inasubiri Amina afadhili");
    expect(t("A sentence nobody translated")).toBe("A sentence nobody translated");
    expect(makeT("en")("Hello {name}", { name: "Amina" })).toBe("Hello Amina");
  });

  it("covers the fixed words shown on screens: every t(\"…\") literal in the app has a Kiswahili entry", () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = path.join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx$/.test(p) && !/test|legal|privacy|terms/.test(p)) files.push(p);
      }
    };
    walk(path.resolve(import.meta.dirname, ".."));
    const missing: string[] = [];
    for (const f of files) {
      for (const m of readFileSync(f, "utf8").matchAll(/\bt\("((?:[^"\\]|\\.)*)"/g)) {
        const key = m[1].replace(/\\"/g, '"');
        if (!(key in SW) && !SW_PATTERNS.some(([re]) => re.test(key))) missing.push(`${path.basename(f)}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("covers labels that are looked up at run time (states, timeline actions, How it works)", () => {
    const all = [...Object.values(STATE_LABEL), ...Object.values(ACTION_LABEL), ...RAIL_LABELS, ...HOW_STEPS.flatMap((s) => [s.title, s.text, s.note])];
    expect(all.filter((s) => !(s in SW))).toEqual([]);
  });
});
