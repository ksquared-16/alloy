/**
 * Workspace Trust Closure — navigation continuity certification.
 *
 * This spec is designed to run against a REAL authenticated workspace (local dev with a logged-in
 * session, or staging). It never embeds credentials. Provide:
 *   PLAYWRIGHT_BASE_URL       base URL (default http://127.0.0.1:3000)
 *   PLAYWRIGHT_STORAGE_STATE  path to a Playwright storageState JSON (a pre-authenticated session)
 *   WU_SLUG_A                 slug of a representative populated Work Unit (default "new-leads")
 *   WU_SLUG_B                 slug of a second Work Unit for switching (default "" → switching skipped)
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=https://staging.example \
 *   PLAYWRIGHT_STORAGE_STATE=./.auth/state.json \
 *   WU_SLUG_A=new-leads WU_SLUG_B=touring \
 *   npx playwright test playwright/tests/workspace-trust-closure.spec.ts
 *
 * It reads the in-app instrumentation (window.__alloyWorkspaceBaseline) added by this sprint, so it
 * requires the perceived-perf marks to be ON (dev/staging default; NEXT_PUBLIC_PERF_PERCEIVED_MARKS
 * must not be "0"). Each scenario captures the navigation report into test output.
 */

import { test, expect, type Page } from "@playwright/test";

const STORAGE_STATE = process.env.PLAYWRIGHT_STORAGE_STATE;
const WU_A = process.env.WU_SLUG_A || "new-leads";
const WU_B = process.env.WU_SLUG_B || "";

if (STORAGE_STATE) test.use({ storageState: STORAGE_STATE });

type NavRow = {
    nav_id: number;
    work_unit_slug: string | null;
    mode: "cold" | "warm" | "prefetched" | "return";
    shell_visible_ms: number | null;
    coherent_content_ms: number | null;
    interaction_ready_ms: number | null;
    request_count: number;
    duplicate_request_count: number;
    cache_outcomes: Record<string, number>;
};

function workUnitPath(slug: string): string {
    return `/adminV2/workspace/work-unit/${slug}`;
}

/** Navigate to a work unit and wait for the surface to be established (not the cold skeleton). */
async function openWorkUnit(page: Page, slug: string): Promise<void> {
    await page.goto(workUnitPath(slug), { waitUntil: "commit" });
    const surface = page.locator('[data-component="WorkUnitSurface"]');
    await expect(surface).toBeVisible({ timeout: 30_000 });
    await expect(surface).toHaveAttribute("data-surface-mode", /live|held/, { timeout: 30_000 });
}

async function baseline(page: Page): Promise<{ current: NavRow | null; navigations: NavRow[] }> {
    return page.evaluate(() => {
        const fn = (window as unknown as { __alloyWorkspaceBaseline?: () => unknown }).__alloyWorkspaceBaseline;
        return (fn ? fn() : { current: null, navigations: [] }) as { current: NavRow | null; navigations: NavRow[] };
    });
}

/** Skip the whole file cleanly if we land on the login screen (no valid session provided). */
test.beforeEach(async ({ page }) => {
    await page.goto(workUnitPath(WU_A), { waitUntil: "commit" });
    if (/\/login/.test(page.url())) {
        test.skip(true, "No authenticated session — set PLAYWRIGHT_STORAGE_STATE to a logged-in state.");
    }
});

test.describe("Workspace Trust Closure — continuity", () => {
    test("Scenario A — cold entry reveals as one coherent composition", async ({ page }) => {
        test.setTimeout(90_000);
        await openWorkUnit(page, WU_A);
        // Once established it must never fall back to the cold skeleton (one reveal, not region-by-region).
        await expect(page.locator('[data-component="WorkUnitSurface"]')).toHaveAttribute("data-surface-mode", "live", {
            timeout: 30_000,
        });
        const report = await baseline(page);
        console.log("[trust-closure] A cold:", JSON.stringify(report.current));
        expect(report.current?.duplicate_request_count ?? 0).toBe(0);
    });

    test("Scenario B — return navigation restores retained content with no full loading state", async ({ page }) => {
        test.setTimeout(120_000);
        await openWorkUnit(page, WU_A);
        // Leave to another workspace surface, then return.
        await page.goto("/adminV2/workspace", { waitUntil: "commit" });
        await page.waitForTimeout(400);
        await page.goto(workUnitPath(WU_A), { waitUntil: "commit" });

        const surface = page.locator('[data-component="WorkUnitSurface"]');
        // Retained content is present essentially immediately — the cold skeleton must not appear.
        await expect(surface).toHaveAttribute("data-surface-mode", /live|held/, { timeout: 5_000 });
        await expect(surface).toHaveAttribute("data-surface-mode", "live", { timeout: 30_000 });

        const report = await baseline(page);
        const ret = report.current;
        console.log("[trust-closure] B return:", JSON.stringify(ret));
        expect(ret?.mode).toBe("return");
        // Return should render from cache: coherent content near-instant, no duplicate requests.
        expect(ret?.duplicate_request_count ?? 0).toBe(0);
        expect(ret?.coherent_content_ms ?? 0).toBeLessThan(300);
    });

    test("Scenario C — Work Unit switching retains each unit's state", async ({ page }) => {
        test.skip(!WU_B, "Set WU_SLUG_B to run the switching scenario.");
        test.setTimeout(150_000);
        await openWorkUnit(page, WU_A);
        await openWorkUnit(page, WU_B);
        await openWorkUnit(page, WU_A);
        const report = await baseline(page);
        console.log("[trust-closure] C switch (A revisit):", JSON.stringify(report.current));
        expect(report.current?.mode).toBe("return");
    });

    test("Scenario E — slow network keeps retained content usable on revisit", async ({ page, context }) => {
        test.setTimeout(150_000);
        await openWorkUnit(page, WU_A);
        // Throttle the network via CDP, then leave and return.
        const client = await context.newCDPSession(page);
        await client.send("Network.emulateNetworkConditions", {
            offline: false,
            latency: 400,
            downloadThroughput: (200 * 1024) / 8,
            uploadThroughput: (200 * 1024) / 8,
        });
        await page.goto("/adminV2/workspace", { waitUntil: "commit" });
        await page.waitForTimeout(300);
        await page.goto(workUnitPath(WU_A), { waitUntil: "commit" });
        const surface = page.locator('[data-component="WorkUnitSurface"]');
        // Even under throttling the retained composition is visible immediately (served from memory).
        await expect(surface).toHaveAttribute("data-surface-mode", /live|held/, { timeout: 8_000 });
        console.log("[trust-closure] E slow-net return:", JSON.stringify((await baseline(page)).current));
    });
});

/**
 * Scenario D (mutation) is intentionally left as a documented manual/parameterized step: it needs a
 * known safe, reversible action for the target Work Unit. To certify it, execute a representative
 * action, then assert that only the affected row/summary updates while the shell + unrelated queues
 * stay mounted (no data-surface-mode transition back to "cold"), and that the navigation report shows
 * no full route reconstruction.
 */
