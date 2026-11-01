import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Coverage targets from the Product Quality Plan (section 4) and NFR-6.2:
 * 80% overall for the business logic, 95% for the ledger, the state machine and the audit chain.
 * The run fails if a target is missed, so the CI pipeline enforces it.
 */
const CRITICAL = ["src/domain/ledger.ts", "src/domain/states.ts", "src/domain/audit.ts"];
const strict = { lines: 95, functions: 95, statements: 95, branches: 90 };

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/domain/**/*.ts", "src/server/memory-repository.ts",
        "src/server/ops.ts", "src/server/rate-limit.ts", "src/server/supabase-repository.ts"],
      exclude: ["src/**/*.test.ts"],
      reporter: ["text", "text-summary", "json-summary", "lcov", "html"],
      reportsDirectory: "coverage",
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 75,
        ...Object.fromEntries(CRITICAL.map((f) => [f, strict])),
      },
    },
  },
});
