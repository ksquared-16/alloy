import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import {
    ASSIGNMENTS_WORKSPACE,
    ROSTER_WORKSPACE,
    SETTLE,
    TODDLER_A,
    openRosterAtRiverside,
    openRosterWorkspace,
    pickSite,
} from "./rosterWorkspace";

/**
 * Roster is a first-class operational workspace, and Assignments no longer owns
 * any of it.
 *
 * The move is only worth anything if BOTH halves are true. A new workspace that
 * leaves the old tabs in place doesn't clarify ownership, it doubles it — an
 * operator finding Attendance in two places has to work out which one is real.
 * So this spec proves the arrival AND the removal, and that nothing written
 * against the old location dead-ends.
 *
 * Context preservation across the move is the central acceptance requirement and
 * is certified here end to end: site and date must survive every axis change.
 */

const SHOTS = path.join(__dirname, "..", "evidence", "roster-product-audit");

test.beforeAll(() => fs.mkdirSync(SHOTS, { recursive: true }));

async function openAssignments(page: Page) {
    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-adminv2-sidebar-modal-nav="scheduling"]').click();
    await page.locator(ASSIGNMENTS_WORKSPACE).waitFor({ timeout: SETTLE });
}

test("Roster is a peer workspace in the operational navigation", async ({ page }) => {
    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");

    const nav = await page.evaluate(() =>
        [...document.querySelectorAll("[data-adminv2-sidebar-modal-nav]")].map((el) =>
            el.getAttribute("data-adminv2-sidebar-modal-nav"),
        ),
    );
    console.log(`[CERT nav] ${JSON.stringify(nav)}`);
    expect(nav).toContain("roster");
    // Peer of Assignments, not nested under it.
    expect(nav).toContain("scheduling");

    await page.locator('[data-adminv2-sidebar-modal-nav="roster"]').click();
    await expect(page.locator(ROSTER_WORKSPACE)).toBeVisible({ timeout: SETTLE });

    const sections = await page.evaluate(() => {
        const scope = document.querySelector("[data-adminv2-roster-workspace]");
        return (scope?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    });
    console.log(`[CERT roster chrome] ${sections}`);
    expect(sections).toContain("Roster");
    expect(sections).toContain("Attendance");
    await page.screenshot({ path: path.join(SHOTS, "90-roster-workspace.png"), fullPage: true });
});

test("Assignments no longer exposes Roster or Attendance", async ({ page }) => {
    await openAssignments(page);
    await page.waitForTimeout(3000);

    const chrome = await page.evaluate(() => {
        const scope = document.querySelector("[data-adminv2-scheduling-workspace]");
        return (scope?.textContent ?? "").replace(/\s+/g, " ").trim();
    });
    console.log(`[CERT assignments chrome] ${chrome.slice(0, 220)}`);

    // Its own sections remain.
    expect(chrome).toContain("Overview");
    expect(chrome).toContain("Assignments");
    expect(chrome).toContain("Studio");
    // The moved ones are gone — no second owner.
    expect(chrome).not.toContain("Daily Roster");
    await expect(page.locator("[data-daily-roster]")).toHaveCount(0);
    await expect(page.locator("[data-roster-range]")).toHaveCount(0);
    await expect(page.locator("[data-attendance-overview]")).toHaveCount(0);
    await page.screenshot({ path: path.join(SHOTS, "95-assignments-after-move.png"), fullPage: true });
});

/**
 * A deep link written before the move survives in a real place: the
 * `alloy.assignments.workspace.deeplink` session key, which an older bundle may
 * have written before the operator reloaded. Opening Assignments then replays it.
 *
 * That is the realistic dead-end, and it is the one this asserts. (A raw
 * `adminv2:open-scheduling-modal` event with no modal open cannot be the test —
 * nothing is mounted to hear it, so it would prove only that a no-op is a no-op.)
 */
test("a stale deep link for a moved surface lands in Roster, not on a dead tab", async ({
    page,
}) => {
    for (const [workView, expectSection] of [
        ["roster", "roster"],
        ["daily_roster", "roster"],
        ["attendance", "attendance"],
    ] as const) {
        await page.goto("/workspace");
        await page.waitForLoadState("domcontentloaded");
        await page.evaluate((view) => {
            sessionStorage.setItem(
                "alloy.assignments.workspace.deeplink",
                JSON.stringify({ mode: "work", workView: view }),
            );
        }, workView);

        await page.locator('[data-adminv2-sidebar-modal-nav="scheduling"]').click();

        // Forwarded: the operator ends up in Roster, on the right section, and is
        // NOT left looking at Assignments' Overview wondering where Roster went.
        await expect(page.locator(ROSTER_WORKSPACE)).toBeVisible({ timeout: SETTLE });
        await expect(page.locator(ROSTER_WORKSPACE)).toHaveAttribute(
            "data-roster-section",
            expectSection,
            { timeout: SETTLE },
        );
        await expect(page.locator(ASSIGNMENTS_WORKSPACE)).toHaveCount(0);
        console.log(`[CERT stale deep link] workView=${workView} → roster/${expectSection}`);
    }
});

test("site and date survive every axis change inside the workspace", async ({ page }) => {
    await openRosterAtRiverside(page);
    const dateInput = page.locator("[data-roster-date]");
    await expect(dateInput).toBeVisible({ timeout: SETTLE });

    // Move off today so a silent reset is visible rather than a coincidence.
    for (let i = 0; i < 2; i += 1) await page.locator("[data-roster-next-day]").click();
    const chosen = await dateInput.inputValue();
    const siteBefore = await page.locator('button[aria-label="Site"]').first().textContent();
    console.log(`[CERT context] chosen=${chosen} site=${siteBefore?.trim()}`);
    expect(chosen).toBeTruthy();

    const mondayOf = (ymd: string) => {
        const d = new Date(`${ymd}T00:00:00`);
        const shift = d.getDay() === 0 ? -6 : 1 - d.getDay();
        d.setDate(d.getDate() + shift);
        return d.toISOString().slice(0, 10);
    };

    // Day → Week → Day
    await page.locator('[data-roster-range-option="week"]').click();
    await expect(page.locator("[data-roster-week-label]")).toBeVisible({ timeout: SETTLE });
    await page.locator('[data-roster-range-option="day"]').click();
    await expect(dateInput).toBeVisible({ timeout: SETTLE });
    const afterRange = await dateInput.inputValue();
    expect(mondayOf(afterRange)).toBe(mondayOf(chosen));

    // Rooms → Staff → Rooms (week lens axis), then back to Day.
    await page.locator('[data-roster-range-option="week"]').click();
    await expect(page.locator("[data-roster-lens]")).toBeVisible({ timeout: SETTLE });
    await page.locator('[data-roster-lens-option="staff"]').click();
    await expect(page.locator("[data-roster-staff-lens]")).toBeVisible({ timeout: SETTLE });
    await page.locator('[data-roster-lens-option="rooms"]').click();
    await expect(page.locator("[data-scheduling-roster]")).toBeVisible({ timeout: SETTLE });
    await page.locator('[data-roster-range-option="day"]').click();
    await expect(dateInput).toBeVisible({ timeout: SETTLE });
    const afterLens = await dateInput.inputValue();
    expect(mondayOf(afterLens)).toBe(mondayOf(chosen));

    // Site never silently reverts to the first site.
    const siteAfter = await page.locator('button[aria-label="Site"]').first().textContent();
    expect(siteAfter?.trim()).toBe(siteBefore?.trim());
    expect(siteAfter).toContain("Riverside");
});

test("Roster → Attendance → Roster keeps site and room, inside one workspace", async ({ page }) => {
    await openRosterAtRiverside(page);
    await expect(page.locator(`[data-roster-room="${TODDLER_A}"]`)).toBeVisible({ timeout: SETTLE });

    await page.locator(`[data-roster-open-attendance="${TODDLER_A}"]`).click();

    // Same workspace — Attendance is a section of Roster, not a different modal.
    await expect(page.locator(ROSTER_WORKSPACE)).toHaveAttribute("data-roster-section", "attendance", {
        timeout: SETTLE,
    });
    await expect(page.locator(ASSIGNMENTS_WORKSPACE)).toHaveCount(0);
    await expect(page.locator(`[data-attendance-room="${TODDLER_A}"]`)).toBeVisible({
        timeout: SETTLE,
    });
    await page.screenshot({ path: path.join(SHOTS, "94-attendance-in-roster.png"), fullPage: true });

    // The reciprocal move exists and returns to the expectation layer.
    await page.locator("[data-attendance-back-to-roster]").click();
    await expect(page.locator(ROSTER_WORKSPACE)).toHaveAttribute("data-roster-section", "roster", {
        timeout: SETTLE,
    });
    await expect(page.locator("[data-daily-roster]")).toBeVisible({ timeout: SETTLE });
    const site = await page.locator('button[aria-label="Site"]').first().textContent();
    expect(site).toContain("Riverside");
});

test("Manage → crosses to Assignments and leaves Roster behind, not stacked", async ({ page }) => {
    await openRosterAtRiverside(page);
    await page.locator(`[data-roster-room-toggle="${TODDLER_A}"]`).click();
    const staffChip = page.locator(`[data-roster-room="${TODDLER_A}"] [data-roster-staff]`).first();
    await expect(staffChip).toBeVisible({ timeout: SETTLE });
    await staffChip.locator("[data-roster-manage-assignment]").click();

    // Assignments opens, at that subject. Workspace modals are mutually exclusive,
    // so Roster must be gone rather than layered underneath.
    await expect(page.locator(ASSIGNMENTS_WORKSPACE)).toBeVisible({ timeout: SETTLE });
    await expect(page.locator(ROSTER_WORKSPACE)).toHaveCount(0);
    const row = page.locator('[data-assignment-roster-subject^="staff:"]').first();
    await expect(row).toBeVisible({ timeout: SETTLE });
    console.log(`[CERT manage cross-workspace] ${(await row.textContent())?.replace(/\s+/g, " ").trim()}`);
    await page.screenshot({ path: path.join(SHOTS, "93-manage-in-assignments.png"), fullPage: true });
});

test("a Roster deep link can name site, section and range together", async ({ page }) => {
    await openRosterWorkspace(page, { section: "roster", range: "week", lens: "staff" });
    await expect(page.locator(ROSTER_WORKSPACE)).toHaveAttribute("data-roster-section", "roster");
    await pickSite(page, "Riverside");
    await expect(page.locator("[data-roster-staff-lens]")).toBeVisible({ timeout: SETTLE });
    await expect(page.locator("[data-roster-lens]")).toHaveAttribute("data-roster-lens", "staff");
    await expect(page.locator("[data-roster-range]")).toHaveAttribute("data-roster-range", "week");
});
