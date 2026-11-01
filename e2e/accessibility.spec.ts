import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { login, type Who } from "./helpers";

/** Automated WCAG 2.1 A/AA checks (NFR-5.3). Automated tools find roughly a third of issues, so this complements manual keyboard and screen-reader checks. */
const PAGES: { who: Who | null; path: string }[] = [
  { who: null, path: "/" },
  { who: null, path: "/demo" },
  { who: "amina", path: "/dashboard" },
  { who: "amina", path: "/contracts" },
  { who: "amina", path: "/contracts/new" },
  { who: "amina", path: "/wallet" },
  { who: "amina", path: "/notifications" },
  { who: "amina", path: "/profile" },
  { who: "daniel", path: "/admin" },
  { who: "daniel", path: "/admin/mail" },
  { who: "grace", path: "/notifications" },
  { who: "faith", path: "/audit" },
  { who: "grace", path: "/dashboard" },
];

for (const { who, path } of PAGES) {
  test(`${path} as ${who ?? "a visitor"} has no serious or critical accessibility violations [NFR-5.3]`, async ({ browser, page }) => {
    const p = who ? await login(browser, who) : page;
    await p.goto(path);
    const results = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${v.id}: ${v.help} (${v.nodes.length} nodes, e.g. ${v.nodes[0]?.target})`)).toEqual([]);
  });
}
