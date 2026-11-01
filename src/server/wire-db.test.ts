import { describe, expect, it } from "vitest";
import { parseEnv, projectRef } from "../../scripts/wire-db.mjs";

describe("database wiring helpers", () => {
  it("reads KEY=value lines, strips quotes, and ignores comments", () => {
    expect(parseEnv('# comment\nA=1\nB="two"\n  C = three \nlower=x\n#D=4')).toEqual({ A: "1", B: "two", C: "three" });
  });
  it("finds the project reference only in a real Supabase URL", () => {
    expect(projectRef("https://abcdefghijklmnopqrst.supabase.co")).toBe("abcdefghijklmnopqrst");
    expect(projectRef("https://example.com")).toBeNull();
    expect(projectRef("https://short.supabase.co")).toBeNull();
  });
});
