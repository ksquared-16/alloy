import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import {
    ASSIGNMENTS_WORKSPACE,
    ROSTER_WORKSPACE,
    SETTLE,
    TODDLER_A,
    openRosterAtRiverside,
} from "./rosterWorkspace";

/**
 * Roster Product V1 — the acceptance story, in one pass.
 *
 * One director, one sitting, doing the job the product exists for. The
 * individual behaviours are certified by the focused specs; this proves they
 * compose into a journey rather than into a set of features that each work alone.
 *
 * Screenshots taken along the way are the V1 evidence set.
 */

const SHOTS = path.join(__dirname, "..", "evidence", "roster-v1-acceptance");

test.beforeAll(() => fs.mkdirSync(SHOTS, { recursive: true }));

test("the Roster V1 journey", async ({ page }) => {
    // → Director opens Roster from workspace navigation, picks Riverside, Day.
    await openRosterAtRiverside(page);
    await expect(page.locator("[data-roster-range]")).toHaveAttribute("data-roster-range", "day");
    await expect(page.locator(`[data-roster-room="${TODDLER_A}"]`)).toBeVisible({ timeout: SETTLE });
    await page.screenshot({ path: path.join(SHOTS, "1-roster-day-rooms.png"), fullPage: true });

    // → the room that needs attention is FIRST, not alphabetically placed.
    const firstRoom = await page.evaluate(
        () => document.querySelector("[data-roster-room]")?.getAttribute("data-roster-room") ?? null,
    );
    expect(firstRoom).toBe(TODDLER_A);

    // → opens Toddler A: expected children and scheduled staff, kept distinct.
    await page.locator(`[data-roster-room-toggle="${TODDLER_A}"]`).click();
    const room = page.locator(`[data-roster-room="${TODDLER_A}"]`);
    await expect(room.locator("[data-roster-child]").first()).toBeVisible({ timeout: SETTLE });
    await expect(room.locator("[data-roster-staff]").first()).toBeVisible({ timeout: SETTLE });
    const composition = await page.evaluate((id) => {
        const el = document.querySelector(`[data-roster-room="${id}"]`);
        return {
            children: [...(el?.querySelectorAll("[data-roster-child]") ?? [])].map((n) =>
                (n.textContent ?? "").replace(/Manage\s*→?/, "").replace(/\s+/g, " ").trim(),
            ),
            staff: [...(el?.querySelectorAll("[data-roster-staff]") ?? [])].map((n) =>
                (n.textContent ?? "").replace(/Manage\s*→?/, "").replace(/\s+/g, " ").trim(),
            ),
        };
    }, TODDLER_A);
    console.log(`[ACCEPT composition] ${JSON.stringify(composition)}`);
    expect(composition.children.length).toBeGreaterThan(0);
    expect(composition.staff.length).toBeGreaterThan(0);
    await page.screenshot({ path: path.join(SHOTS, "2-short-room-open.png"), fullPage: true });

    // → Week: the plan, with the staffing verdict on every day.
    await page.locator('[data-roster-range-option="week"]').click();
    await expect(page.locator("[data-roster-week-label]")).toBeVisible({ timeout: SETTLE });
    await expect(page.locator(`[data-scheduling-roster-room="${TODDLER_A}"]`)).toBeVisible({
        timeout: SETTLE,
    });
    await page.screenshot({ path: path.join(SHOTS, "3-roster-week.png"), fullPage: true });

    // → Staff lens: where is Jane working this week.
    await page.locator('[data-roster-lens-option="staff"]').click();
    await expect(page.locator("[data-roster-staff-lens]")).toBeVisible({ timeout: SETTLE });
    const jane = page.locator("[data-roster-staff-lens-person]").first();
    await expect(jane).toBeVisible({ timeout: SETTLE });
    console.log(`[ACCEPT staff lens] ${(await jane.textContent())?.replace(/\s+/g, " ").trim()}`);
    await page.screenshot({ path: path.join(SHOTS, "4-staff-lens.png"), fullPage: true });

    // → back to Day and today, then hand off to Attendance in the same workspace.
    await page.locator('[data-roster-range-option="day"]').click();
    await expect(page.locator("[data-daily-roster]")).toBeVisible({ timeout: SETTLE });
    const todayBtn = page.locator("[data-roster-today]");
    if (await todayBtn.count()) await todayBtn.click();
    await expect(page.locator(`[data-roster-open-attendance="${TODDLER_A}"]`)).toBeVisible({
        timeout: SETTLE,
    });
    await page.locator(`[data-roster-open-attendance="${TODDLER_A}"]`).click();

    await expect(page.locator(ROSTER_WORKSPACE)).toHaveAttribute("data-roster-section", "attendance", {
        timeout: SETTLE,
    });
    await expect(page.locator(`[data-attendance-room="${TODDLER_A}"]`)).toBeVisible({
        timeout: SETTLE,
    });
    await page.screenshot({ path: path.join(SHOTS, "5-attendance-in-roster.png"), fullPage: true });

    // → and returns to the expectation layer.
    await page.locator("[data-attendance-back-to-roster]").click();
    await expect(page.locator("[data-daily-roster]")).toBeVisible({ timeout: SETTLE });
    await expect(page.locator('button[aria-label="Site"]').first()).toContainText("Riverside");
});

test("Assignments, after the move, owns commitments and nothing else", async ({ page }) => {
    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-adminv2-sidebar-modal-nav="scheduling"]').click();
    await page.locator(ASSIGNMENTS_WORKSPACE).waitFor({ timeout: SETTLE });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(SHOTS, "6-assignments-after-move.png"), fullPage: true });

    await expect(page.locator("[data-daily-roster]")).toHaveCount(0);
    await expect(page.locator("[data-roster-range]")).toHaveCount(0);
    await expect(page.locator("[data-attendance-overview]")).toHaveCount(0);
});
