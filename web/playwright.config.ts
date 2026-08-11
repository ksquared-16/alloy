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
    // RedactingReporter MUST stay first: reporters share result objects and run in
    // order, so it scrubs auth material out of Playwright's own call logs before
    // `line` serializes them. A failing authenticated request prints request
    // headers — that is how a session cookie leaked during Search V2 certification.
    reporter: [["./playwright/redactingReporter.ts"], ["line"]],
    use: {
        baseURL: process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, "") || "http://127.0.0.1:3000",
        storageState: process.env.PLAYWRIGHT_STORAGE_STATE?.trim() || undefined,
        trace: "on-first-retry",
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
