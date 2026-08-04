import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Unit tests only — pure functions, no database and no HTTP.
//
// That constraint is deliberate: the housekeeping business rules were written as
// pure functions over plain snapshots precisely so they could be tested without
// standing up MySQL. End-to-end behaviour is covered by the HTTP smoke tests run
// during each phase, and by `npm run hk:verify` against live data.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Fail loudly rather than silently passing an empty run.
    passWithNoTests: false,
  },
});
