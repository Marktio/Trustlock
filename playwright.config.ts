import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;

/**
 * End-to-end tests run against the production build in demo mode (in-memory data, seeded accounts, no Clerk).
 * Tests run one after another because they share that one in-memory database.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["json", { outputFile: "test-results/e2e-results.json" }], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/demo`,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    // The general limit is raised here because dozens of tests share a few demo users and one address; the sign-in limit stays at its default and has its own test.
    env: { RATE_LIMIT_PER_MINUTE: "5000", TRUSTLOCK_SEED_DEMO: "true", NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "", CLERK_SECRET_KEY: "" },
  },
});
