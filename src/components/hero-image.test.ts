import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SW } from "@/i18n/sw";

const root = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

describe("Landing hero picture", () => {
  const webp = readFileSync(path.join(root, "src/assets/hero/vault.webp"));

  it("is a WebP file that keeps a transparent background (alpha channel)", () => {
    expect(webp.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(webp.subarray(8, 12).toString("ascii")).toBe("WEBP");
    expect(webp.subarray(12, 16).toString("ascii")).toBe("VP8X"); // extended format, the only one that can carry alpha
    expect(webp[20] & 0x10).toBe(0x10); // alpha flag set
  });

  it("stays small enough to load fast", () => {
    expect(webp.length).toBeLessThan(300 * 1024);
  });

  it("is the picture the landing page shows, and the chips use translated text", () => {
    expect(read("src/app/page.tsx")).toContain("<HeroImage");
    const src = read("src/components/hero-image.tsx");
    expect(src).toContain("@/assets/hero/vault.webp");
    expect(src).toContain('t("Held in escrow")');
    expect(src).toContain('t("Cryptographically verified")');
  });

  it("has a Kiswahili line for the new chip", () => {
    expect(SW["Cryptographically verified"]).toBeTruthy();
    expect(SW["Held in escrow"]).toBeTruthy();
  });

  it("keeps the real example contract on the sign-in pages", () => {
    expect(read("src/components/auth-shell.tsx")).toContain("ExampleContract");
  });
});
