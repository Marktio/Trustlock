import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HOW_STEPS, HOW_VIDEO, RAIL_LABELS } from "./how-steps";

const pub = (u: string) => path.resolve(import.meta.dirname, "../../public", u.replace(/^\//, ""));

describe("How it works content", () => {
  it("has the four steps, each with text and a valid rail position", () => {
    expect(HOW_STEPS).toHaveLength(4);
    for (const s of HOW_STEPS) {
      expect(s.title.length).toBeGreaterThan(3);
      expect(s.text.length).toBeGreaterThan(20);
      expect(s.rail).toBeGreaterThanOrEqual(0);
      expect(s.rail).toBeLessThan(RAIL_LABELS.length);
    }
  });

  it("never invents or loses credits: Available + Held + Brian = 100,000 SC minus the 900 SC fee only after release", () => {
    const [lock, deliver, release, dispute] = HOW_STEPS;
    const total = (s: (typeof HOW_STEPS)[number]) => s.amina.available + s.amina.held + s.brian.available + s.brian.held;
    expect(total(lock)).toBe(100_000);
    expect(total(deliver)).toBe(100_000);
    expect(total(dispute)).toBe(100_000);
    expect(total(release) + 900).toBe(100_000); // 900 SC is the platform fee account
    expect(release.brian.available).toBe(45_000 - 900); // 2% of 45,000
  });

  it("video, poster and captions files exist and the captions are valid WebVTT", () => {
    for (const u of [HOW_VIDEO.src, HOW_VIDEO.poster, HOW_VIDEO.captions]) {
      expect(existsSync(pub(u)), u).toBe(true);
    }
    expect(statSync(pub(HOW_VIDEO.src)).size).toBeGreaterThan(1_000_000);
    const vtt = readFileSync(pub(HOW_VIDEO.captions), "utf8");
    expect(vtt.startsWith("WEBVTT")).toBe(true);
    expect(vtt).toMatch(/\d\d:\d\d:\d\d\.\d{3} --> \d\d:\d\d:\d\d\.\d{3}/);
  });
});
