import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * UX-3 — ONE ROSTER CONTROL BAND, IN ONE PLACE, IN EVERY STATE.
 *
 * The defect was physical: range and lens controls were rendered by four different owners, so they
 * jumped between the right edge, a left-aligned toolbar and a header row as the operator switched
 * range or lens. Day, Week, Rooms, Staff and Assignments read as five products.
 *
 * ── WHY THIS MEASURES GEOMETRY AND NOT MARKUP ──
 *
 * "The band exists" is satisfied by a band that exists in a different place each time. So the
 * load-bearing assertion compares the band's actual bounding box ACROSS transitions: same x, same y,
 * within a tolerance that allows content reflow but not relocation. A refactor that kept four owners
 * and merely gave them a shared class name would pass a markup check and fail this one.
 *
 * Fixtures: `certification/fixtures/roster-people-search-convergence.sql`.
 */

const SHOTS = path.join(__dirname, "..", "evidence", "operations-roster-control-band");
const SETTLE = 180_000;

const OPERATIONS_NAV = '[data-adminv2-sidebar-modal-nav="operations"]';
const SHELL = '[data-adminv2-operations-workspace="true"]';
const BAND = '[data-roster-control-band="true"]';
const RANGE = "[data-roster-range]";
const LENS = "[data-roster-lens]";

/** Position tolerance in px. Generous enough for reflow, far tighter than left↔right relocation. */
const TOLERANCE = 4;

test.beforeAll(() => fs.mkdirSync(SHOTS, { recursive: true }));

async function openRoster(page: Page) {
    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");
    await page.locator(OPERATIONS_NAV).click();
    await expect(page.locator(SHELL)).toBeVisible({ timeout: SETTLE });
    await expect(page.locator(BAND)).toBeVisible({ timeout: SETTLE });
}

async function useRiverside(page: Page) {
    await page.locator('button[aria-label="Site"]').first().click();
    await page.locator("[role=option]", { hasText: "Riverside" }).first().click();
    await expect(page.locator(SHELL)).toContainText("Riverside", { timeout: SETTLE });
}

async function setRange(page: Page, range: "day" | "week") {
    await page.locator(`[data-roster-range-option="${range}"]`).click();
    await expect(page.locator(RANGE)).toHaveAttribute("data-roster-range", range, { timeout: SETTLE });
}

async function setLens(page: Page, lens: "rooms" | "staff" | "assignments") {
    await page.locator(`[data-roster-lens-option="${lens}"]`).click();
    await expect(page.locator(LENS)).toHaveAttribute("data-roster-lens", lens, { timeout: SETTLE });
}

/** The band's position, and a guarantee there is exactly ONE of everything. */
async function bandGeometry(page: Page) {
    await expect(page.locator(BAND)).toHaveCount(1);
    // No duplicate controls anywhere — the four-owner defect would show up here first.
    await expect(page.locator(RANGE)).toHaveCount(1);
    await expect(page.locator(LENS)).toHaveCount(1);
    await expect(page.locator('[data-roster-range-option="day"]')).toHaveCount(1);
    await expect(page.locator('[data-roster-lens-option="rooms"]')).toHaveCount(1);
    const box = await page.locator(BAND).boundingBox();
    expect(box, "the control band must be laid out").not.toBeNull();
    return box!;
}

// ═══ 1–2 · 11–12 — the band exists, once ═════════════════════════════════════════════════════
test("1+2+11+12 — Operations → Roster has exactly one control band and no duplicate controls", async ({
    page,
}) => {
    await openRoster(page);
    await bandGeometry(page);

    // Every lens is PRESENT in every range — availability varies, presence never does.
    for (const lens of ["rooms", "staff", "assignments"]) {
        await expect(page.locator(`[data-roster-lens-option="${lens}"]`)).toHaveCount(1);
    }

    await page.screenshot({ path: path.join(SHOTS, "01-band.png"), fullPage: true });
});

// ═══ 3–8 — every combination, and the band never moves ═══════════════════════════════════════
test("3–8 — all range × lens states render, and the band holds its position", async ({ page }) => {
    await openRoster(page);
    await useRiverside(page);

    const seen: { state: string; x: number; y: number }[] = [];

    const visit = async (range: "day" | "week", lens: "rooms" | "staff" | "assignments") => {
        await setRange(page, range);
        await setLens(page, lens);
        const box = await bandGeometry(page);
        seen.push({ state: `${range}×${lens}`, x: box.x, y: box.y });
        await page.screenshot({
            path: path.join(SHOTS, `0-${range}-${lens}.png`),
            fullPage: true,
        });
    };

    // Day × Rooms, Day × Assignments, Week × Rooms, Week × Staff, Week × Assignments.
    await visit("day", "rooms");
    await visit("day", "assignments");
    await visit("week", "rooms");
    await visit("week", "staff");
    await visit("week", "assignments");
    // …and back to Rooms, closing the Assignments → Rooms transition the brief names.
    await visit("week", "rooms");

    /*
     * THE LOAD-BEARING ASSERTION.
     *
     * Every state's band sits at the same origin. A single owner produces this trivially; four
     * owners cannot, which is why the failure mode being certified is measured rather than described.
     */
    const first = seen[0]!;
    for (const s of seen) {
        expect(Math.abs(s.x - first.x), `${s.state} moved horizontally from ${first.state}`).toBeLessThanOrEqual(
            TOLERANCE,
        );
        expect(Math.abs(s.y - first.y), `${s.state} moved vertically from ${first.state}`).toBeLessThanOrEqual(
            TOLERANCE,
        );
    }
    console.log("[UX-3 band geometry]", JSON.stringify(seen));
});

// ═══ 9–10 — site and anchor survive the transitions ══════════════════════════════════════════
test("9+10 — site survives every transition and the day anchor survives Day → Week → Day", async ({
    page,
}) => {
    await openRoster(page);
    await useRiverside(page);

    await setRange(page, "day");
    await setLens(page, "rooms");
    /*
     * WAIT for the anchor to resolve before capturing it.
     *
     * The day surface reports the ORG's today asynchronously, so the band's date is briefly empty on
     * a cold open. Reading it immediately passed when this spec ran alone and failed inside a full
     * sweep — an order-dependent read, not a product fault, and exactly the kind of assertion that
     * fails for a reason other than its claim.
     */
    await expect
        .poll(async () => page.locator('[data-roster-date="true"]').inputValue(), { timeout: SETTLE })
        .not.toBe("");
    const dayBefore = await page.locator('[data-roster-date="true"]').inputValue();

    // Day → Week → Staff → Assignments → Rooms → Day.
    await setRange(page, "week");
    await setLens(page, "staff");
    await setLens(page, "assignments");
    await setLens(page, "rooms");
    await setRange(page, "day");

    // The SITE never reset to the tenant's first site.
    await expect(page.locator(SHELL)).toContainText("Riverside");
    /*
     * The day anchor came back to the same MOMENT — the surface lands inside the displayed week, on
     * today when the week contains it. Asserted as "still inside that week", not as string equality:
     * Day → Week → Day is defined to preserve the moment, not the exact date, and pinning the
     * stricter claim would encode a behaviour the surface never promised.
     */
    const dayAfter = await page.locator('[data-roster-date="true"]').inputValue();
    expect(dayAfter, "the day anchor must survive the round trip").toBeTruthy();
    const delta = Math.abs(Date.parse(dayAfter) - Date.parse(dayBefore)) / 86_400_000;
    expect(delta, `day moved ${delta}d across Day → Week → Day`).toBeLessThanOrEqual(7);

    await page.screenshot({ path: path.join(SHOTS, "09-10-state-preserved.png"), fullPage: true });
});

// ═══ 13–14 — content still correct, and the Assignments lens still works ═════════════════════
test("13+14 — Roster content is intact and the Assignments ledger still composes", async ({ page }) => {
    await openRoster(page);
    await useRiverside(page);

    // Rooms — the operating surface still renders its rooms.
    await setRange(page, "day");
    await setLens(page, "rooms");
    await expect(page.locator(SHELL)).toContainText("Room", { timeout: SETTLE });

    // Assignments — the canonical ledger, with real rows (the O-3 lens, unchanged).
    await setLens(page, "assignments");
    await expect(page.locator('[data-assignment-roster="true"]')).toBeVisible({ timeout: SETTLE });
    await expect(page.locator("[data-assignment-roster-subject]").first()).toBeVisible({
        timeout: SETTLE,
    });

    // Week board still composes.
    await setRange(page, "week");
    await setLens(page, "rooms");
    await expect(page.locator(SHELL)).toContainText("Riverside");

    await page.screenshot({ path: path.join(SHOTS, "13-14-content.png"), fullPage: true });
});

// ═══ Staff on Day is DISABLED, not hidden ═══════════════════════════════════════════════════
test("an unavailable combination is disabled honestly, never hidden or coerced", async ({ page }) => {
    await openRoster(page);
    await setRange(page, "day");

    const staff = page.locator('[data-roster-lens-option="staff"]');
    // PRESENT — hiding it is what made the row re-flow and the operator's target move.
    await expect(staff).toHaveCount(1);
    await expect(staff).toBeDisabled();
    await expect(staff).toHaveAttribute("data-roster-lens-unavailable", "true");
    // And it says WHY, where the question is.
    expect(await staff.getAttribute("title")).toContain("week view");

    // Selecting Week makes it available — nothing was coerced in either direction.
    await setRange(page, "week");
    await expect(staff).toBeEnabled();

    await page.screenshot({ path: path.join(SHOTS, "matrix-staff-disabled.png"), fullPage: true });
});
