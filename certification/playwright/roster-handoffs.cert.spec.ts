import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Roster hands off; it never rewrites.
 *
 * Two moves an operator makes the moment the roster tells them something:
 *
 *   "is that actually happening?"  → Attendance, same site, same room
 *   "that is wrong"                → the assignment ledger, at that subject
 *
 * Neither existed. The roster could tell a director Toddler Room A was short and
 * offered nowhere to go with it.
 *
 * The Attendance handoff is deliberately conditional. Attendance has NO date
 * control — it can only ever show the org's service date — so offering "Open
 * Attendance" from a roster showing next Tuesday would silently move the operator
 * to a different day. On any non-today date the affordance is replaced by a
 * stated reason, which this spec asserts rather than treating its absence as fine.
 */

const SHOTS = path.join(__dirname, "..", "evidence", "roster-product-audit");
const SETTLE = 120_000;
const SCHEDULING = "[data-adminv2-roster-workspace]";
const TODDLER_A = "00000000-0000-4000-8000-000000000013";
const JANE_PERSON = "00000000-0000-4000-8000-000050000010";

test.beforeAll(() => fs.mkdirSync(SHOTS, { recursive: true }));

async function openRosterDay(page: Page) {
    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");
    await page.evaluate(() => {
        sessionStorage.setItem(
            "alloy.roster.workspace.deeplink",
            JSON.stringify({ section: "roster" }),
        );
    });
    await page.locator('[data-adminv2-sidebar-modal-nav="roster"]').click();
    await page.locator(SCHEDULING).waitFor({ timeout: SETTLE });
    await page.locator('button[aria-label="Site"]').first().click();
    await page.locator("[role=option]", { hasText: "Riverside" }).first().click();
    await expect(page.locator(`[data-roster-room="${TODDLER_A}"]`)).toBeVisible({ timeout: SETTLE });
}

test("Open Attendance carries the room, and only offers itself on today", async ({ page }) => {
    await openRosterDay(page);

    // On today: the handoff is offered.
    const openAttendance = page.locator(`[data-roster-open-attendance="${TODDLER_A}"]`);
    await expect(openAttendance).toBeVisible({ timeout: SETTLE });
    await expect(page.locator(`[data-roster-attendance-unavailable="${TODDLER_A}"]`)).toHaveCount(0);

    // Move off today: it is withdrawn AND says why. An affordance that silently
    // disappears is indistinguishable from one that is broken.
    await page.locator("[data-roster-next-day]").click();
    await expect(page.locator(`[data-roster-attendance-unavailable="${TODDLER_A}"]`)).toBeVisible({
        timeout: SETTLE,
    });
    await expect(page.locator(`[data-roster-open-attendance="${TODDLER_A}"]`)).toHaveCount(0);
    const reason = await page
        .locator(`[data-roster-attendance-unavailable="${TODDLER_A}"]`)
        .textContent();
    console.log(`[CERT attendance unavailable] ${reason?.trim()}`);
    expect(reason).toMatch(/today/i);

    // Back to today, then take the handoff.
    await page.locator("[data-roster-today]").click();
    await expect(openAttendance).toBeVisible({ timeout: SETTLE });
    await openAttendance.click();

    // Attendance opens ON that room, not at the site picker.
    await expect(page.locator(`[data-attendance-room="${TODDLER_A}"]`)).toBeVisible({
        timeout: SETTLE,
    });
    const heading = await page.locator("[data-attendance-overview] header, h2").first().textContent();
    console.log(`[CERT attendance arrival] ${heading?.replace(/\s+/g, " ").trim()}`);
    await page.screenshot({ path: path.join(SHOTS, "70-attendance-handoff.png"), fullPage: true });
});

test("Manage takes a staff member to the assignment ledger, opened at that person", async ({
    page,
}) => {
    await openRosterDay(page);
    await page.locator(`[data-roster-room-toggle="${TODDLER_A}"]`).click();

    const staffChip = page.locator(`[data-roster-room="${TODDLER_A}"] [data-roster-staff]`).first();
    await expect(staffChip).toBeVisible({ timeout: SETTLE });
    await staffChip.locator("[data-roster-manage-assignment]").click();

    // The assignment ledger, with that subject already expanded — not the top of
    // an unfiltered list the operator has to search again.
    const row = page.locator(`[data-assignment-roster-subject="staff:${JANE_PERSON}"]`);
    await expect(row).toBeVisible({ timeout: SETTLE });
    const text = (await row.textContent())?.replace(/\s+/g, " ").trim();
    console.log(`[CERT manage-assignment row] ${text}`);
    expect(text).toContain("Jane");

    // Roster authored nothing on the way — it routed.
    await expect(page.locator("[data-daily-roster]")).toHaveCount(0);
    await page.screenshot({ path: path.join(SHOTS, "71-manage-assignment.png"), fullPage: true });
});

/**
 * The child case is not a formality. This panel keys children by
 * `agreement:<id>` or `member:<id>` depending on what the ledger row carries,
 * while staff are always `staff:<personId>`. A handoff that reconstructs a key
 * instead of matching on identity works for staff and silently matches nothing
 * for children — which is exactly the shape of the first attempt.
 */
test("Manage takes a child to the assignment ledger too, despite a different key shape", async ({
    page,
}) => {
    await openRosterDay(page);
    await page.locator(`[data-roster-room-toggle="${TODDLER_A}"]`).click();

    const childChip = page.locator(`[data-roster-room="${TODDLER_A}"] [data-roster-child]`).first();
    await expect(childChip).toBeVisible({ timeout: SETTLE });
    const childName = (await childChip.textContent())?.replace(/\s+Manage\s*→?\s*$/, "").trim() ?? "";
    console.log(`[CERT manage-assignment child] ${childName}`);
    await childChip.locator("[data-roster-manage-assignment]").click();

    // Some subject row is open, and it is THIS child's.
    const rows = page.locator("[data-assignment-roster-subject]");
    await expect(rows.first()).toBeVisible({ timeout: SETTLE });
    const surname = childName.split(/\s+/)[0] ?? childName;
    await expect(
        page.locator("[data-assignment-roster-subject]", { hasText: surname }).first(),
    ).toBeVisible({ timeout: SETTLE });
});
