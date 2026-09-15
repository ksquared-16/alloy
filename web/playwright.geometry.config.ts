import { defineConfig, devices } from "@playwright/test";

/**
 * Browser geometry certification — deliberately separate from `playwright.config.ts`.
 *
 * The smoke config carries a `baseURL` and an optional `storageState`, because those specs drive
 * a running Alloy against a tenant. This gate must not: it renders the real `FocusPanelCardGrid`
 * into `setContent` with the real runtime stylesheet, so it touches no server, no Supabase and
 * no network at all. Sharing a config would hand it a base URL it must never use and would sweep
 * it into the smoke runs, where a missing dev server would read as a geometry failure.
 *
 * @see playwright/geometry/focusPanelGeometry.spec.ts
 */
export default defineConfig({
    testDir: "./playwright/geometry",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    // One retry on CI absorbs a single hostile frame on a loaded runner. It cannot mask a real
    // geometry failure: every assertion here is deterministic given a settled layout, and
    // `settle()` reports rather than sleeps, so a genuine regression fails both times.
    retries: process.env.CI ? 1 : 0,
    workers: process.env.CI ? 2 : undefined,
    reporter: process.env.CI ? [["github"], ["line"]] : [["line"]],
    use: {
        // Evidence on failure only — a green run must not produce an artifact bundle.
        screenshot: "only-on-failure",
        trace: "off",
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
