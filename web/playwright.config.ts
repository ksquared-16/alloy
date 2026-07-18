import { defineConfig, devices } from "@playwright/test";

/**
 * Minimal Playwright config for Alloy smoke tests.
 * @see playwright/tests/smoke-field-registry.spec.ts
 */
export default defineConfig({
    testDir: "./playwright/tests",
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    reporter: [["line"]],
    use: {
        baseURL: process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, "") || "http://127.0.0.1:3000",
        storageState: process.env.PLAYWRIGHT_STORAGE_STATE?.trim() || undefined,
        trace: "on-first-retry",
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
