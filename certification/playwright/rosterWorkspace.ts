import { expect, type Page } from "@playwright/test";

/**
 * Opening the Roster workspace, for every Roster spec.
 *
 * Roster used to be tabs inside Assignments, so each spec opened the Assignments
 * modal and clicked through. When Roster became its own workspace those steps all
 * had to change in the same way — which is the argument for one helper rather
 * than the same four lines copied into six files and drifting.
 */

export const SETTLE = 120_000;
export const ROSTER_WORKSPACE = "[data-adminv2-roster-workspace]";
export const ASSIGNMENTS_WORKSPACE = "[data-adminv2-scheduling-workspace]";

/** Riverside owns the "A" rooms, Lakeside the "B" rooms. Disjoint by construction. */
export const RIVERSIDE_SITE_ID = "00000000-0000-4000-8000-000000000010";
export const TODDLER_A = "00000000-0000-4000-8000-000000000013";

/**
 * Open the Roster workspace from the left nav, optionally seeding a deep link
 * first (the same session key the product uses — never a private test channel).
 */
export async function openRosterWorkspace(
    page: Page,
    deepLink?: Record<string, unknown>,
): Promise<void> {
    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");
    if (deepLink) {
        await page.evaluate((detail) => {
            sessionStorage.setItem("alloy.roster.workspace.deeplink", JSON.stringify(detail));
        }, deepLink);
    }
    await page.locator('[data-adminv2-sidebar-modal-nav="roster"]').click();
    await page.locator(ROSTER_WORKSPACE).waitFor({ timeout: SETTLE });
}

/** Choose a site by name and wait for the surface, never for a clock. */
export async function pickSite(page: Page, match: string): Promise<void> {
    await page.locator('button[aria-label="Site"]').first().click();
    await page.locator("[role=option]", { hasText: match }).first().click();
}

/** Roster workspace, Riverside, ready to assert on. */
export async function openRosterAtRiverside(
    page: Page,
    deepLink?: Record<string, unknown>,
): Promise<void> {
    await openRosterWorkspace(page, deepLink);
    await pickSite(page, "Riverside");
    await expect(page.locator("[data-roster-range]")).toBeVisible({ timeout: SETTLE });
}
