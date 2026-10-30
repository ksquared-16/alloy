import path from "path";
import { configDefaults, defineConfig } from "vitest/config";

import { judgeLiveSuiteAuthority, liveSuiteNotice, liveSuiteSelection } from "./tests/harness/liveSuiteAuthority.mjs";

/*
 * LIVE SUITES ARE EXCLUDED UNLESS AN EXISTING AUTHORITY HOLDS — before import, so no env file is read,
 * no client is built and no hook runs. Default and explicit selection alike. The only admission is the
 * governed isolated binding, for its exact pinned suite; no shared-stack live suite is ever admitted.
 * See tests/harness/liveSuiteAuthority.mjs.
 */
const liveAuthority = judgeLiveSuiteAuthority({ env: process.env });
const selection = liveSuiteSelection(liveAuthority, {
  baseInclude: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  baseExclude: [...configDefaults.exclude],
});
console.warn(liveSuiteNotice(liveAuthority));

export default defineConfig({
  test: {
    environment: "node",
    include: selection.include,
    exclude: selection.exclude,
    testTimeout: 120_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      // `server-only` is supplied by Next at build time and is not an installed package, so any
      // module carrying the marker fails to IMPORT under vitest — the suite dies before it asserts.
      // Aliasing it to an empty stub lets a server composer keep its build-time boundary AND be
      // certified, instead of dropping the marker to make the module testable.
      // @see tests/harness/serverOnlyStub.ts
      "server-only": path.resolve(__dirname, "./tests/harness/serverOnlyStub.ts"),
    },
  },
});
