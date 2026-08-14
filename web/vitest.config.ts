import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
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
