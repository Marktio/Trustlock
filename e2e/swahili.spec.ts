import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { login, type Who } from "./helpers";

/** The whole app in Kiswahili: the page language is set, screens are translated, and the pages still pass the automated accessibility scan (NFR-5.2, NFR-5.3). */
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
  { who: "faith", path: "/audit" },
];

for (const { who, path } of PAGES) {
  test(`${path} as ${who ?? "a visitor"} in Kiswahili has lang=sw and no serious accessibility violations [NFR-5.2, NFR-5.3]`, async ({ browser, page }) => {
    const p = who ? await login(browser, who) : page;
    await p.context().addCookies([{ name: "tl_lang", value: "sw", url: "http://localhost:3200" }]);
    await p.goto(path);
    await expect(p.locator("html")).toHaveAttribute("lang", "sw");
    const results = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${v.id}: ${v.help} (${v.nodes.length} nodes, e.g. ${v.nodes[0]?.target})`)).toEqual([]);
  });
}

test("the top-bar language switch changes the whole app and the choice is remembered [NFR-5.2]", async ({ browser }) => {
  const p = await login(browser, "amina");
  await p.goto("/dashboard");
  await p.getByRole("button", { name: /SW Kiswahili/ }).first().click();
  await expect(p.locator("html")).toHaveAttribute("lang", "sw");
  await p.goto("/wallet");
  await expect(p.locator("html")).toHaveAttribute("lang", "sw");
  await expect(p.locator("main")).not.toContainText("Top up");
});
