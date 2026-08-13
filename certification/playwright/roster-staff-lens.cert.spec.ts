import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * "Where is Jane scheduled this week?" — the operator job the roster could not
 * answer at all.
 *
 * The Staff lens is a PIVOT of the week roster, not a second read model and not a
 * second request: `buildRosterReadModel` has always returned `scheduledStaff` for
 * every room·day and the API has always serialised it. The Rooms lens indexes
 * that array by room; this one indexes it by person.
 *
 * This spec asserts the pivot is real by requiring that switching lenses issues
 * NO new roster request — if it fetched, it would not be a pivot, and the claim
 * in the component's own header comment would be false.
 */

const SHOTS = path.join(__dirname, "..", "evidence", "roster-product-audit");
const SETTLE = 120_000;
const SCHEDULING = "[data-adminv2-scheduling-workspace]";
const JANE_PERSON = "00000000-0000-4000-8000-000050000010";

test.beforeAll(() => fs.mkdirSync(SHOTS, { recursive: true }));

async function openRosterWeek(page: Page) {
    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");
    await page.evaluate(() => {
        sessionStorage.setItem(
            "alloy.assignments.workspace.deeplink",
            JSON.stringify({ mode: "work", workView: "roster" }),
        );
    });
    await page.locator('[data-adminv2-sidebar-modal-nav="scheduling"]').click();
    await page.locator(SCHEDULING).waitFor({ timeout: SETTLE });
    await page.locator('button[aria-label="Site"]').first().click();
    await page.locator("[role=option]", { hasText: "Riverside" }).first().click();
    await expect(page.locator("[data-roster-range]")).toBeVisible({ timeout: SETTLE });
    await page.locator('[data-roster-range-option="week"]').click();
    await expect(page.locator("[data-roster-week-label]")).toBeVisible({ timeout: SETTLE });
}

test("the Staff lens says where each person is expected, day by day", async ({ page }) => {
    await openRosterWeek(page);

    // The lens belongs to the week range — a single day's staff are already on the
    // Rooms cards, so a Staff lens there would be the same list twice.
    await expect(page.locator("[data-roster-lens]")).toBeVisible({ timeout: SETTLE });

    // A pivot must not fetch. Measuring that needs a QUIET window: the workspace
    // prefetches the adjacent weeks after the board renders, so a counter started
    // the moment the lens control appears catches those and blames the lens.
    let rosterCalls = 0;
    page.on("request", (r) => {
        if (/\/api\/admin\/(roster|scheduling\?view=roster)/.test(r.url())) rosterCalls += 1;
    });
    await expect(page.locator("[data-scheduling-roster-room]").first()).toBeVisible({
        timeout: SETTLE,
    });
    let settled = -1;
    for (let i = 0; i < 20 && settled !== rosterCalls; i += 1) {
        settled = rosterCalls;
        await page.waitForTimeout(1000);
    }
    const beforeSwitch = rosterCalls;

    await page.locator('[data-roster-lens-option="staff"]').click();
    await expect(page.locator("[data-roster-staff-lens]")).toBeVisible({ timeout: SETTLE });
    await page.waitForTimeout(3000);

    const jane = page.locator(`[data-roster-staff-lens-person="${JANE_PERSON}"]`);
    await expect(jane).toBeVisible({ timeout: SETTLE });
    console.log(`[CERT staff lens person] ${(await jane.textContent())?.replace(/\s+/g, " ").trim()}`);

    // Jane's week: the cert fixture schedules her Mon–Fri in Toddler Room A.
    const placements = await page.evaluate(
        (personId) =>
            [...document.querySelectorAll(`[data-roster-staff-lens-cell^="${personId}:"]`)].map(
                (el) => ({
                    key: el.getAttribute("data-roster-staff-lens-cell"),
                    room: el.getAttribute("data-roster-staff-lens-room"),
                }),
            ),
        JANE_PERSON,
    );
    console.log(`[CERT staff lens placements] ${JSON.stringify(placements)}`);
    expect(placements.length).toBe(5);
    for (const p of placements) expect(p.room).toBe("Toddler Room A");

    // The pivot claim, asserted rather than asserted-in-a-comment: the lens switch
    // itself added no roster request.
    console.log(`[CERT staff lens fetches] before=${beforeSwitch} after=${rosterCalls}`);
    expect(rosterCalls).toBe(beforeSwitch);

    await page.screenshot({ path: path.join(SHOTS, "80-staff-lens.png"), fullPage: true });
});

test("a Staff lens name opens the canonical record, not a roster-local detail", async ({ page }) => {
    await openRosterWeek(page);
    await page.locator('[data-roster-lens-option="staff"]').click();
    await expect(page.locator("[data-roster-staff-lens]")).toBeVisible({ timeout: SETTLE });

    await page.locator(`[data-roster-staff-lens-person="${JANE_PERSON}"]`).click();
    await page.waitForTimeout(4000);

    // The gesture goes through the one record-attention adapter. Whatever it
    // resolves to, it must NOT be a drawer and must NOT be a Roster-owned detail
    // panel — the post-drawer model forbids both, and a valid null is a valid
    // answer when no active Work Unit hosts the person.
    const outcome = await page.evaluate(() => ({
        drawer: !!document.querySelector("[data-drawer-root], [data-record-drawer]"),
        rosterOwnedDetail: !!document.querySelector("[data-roster-staff-detail]"),
        refused: /isn.t in this Work View/i.test(document.body.innerText),
        focusPanel: !!document.querySelector("[data-focus-panel], [data-adminv2-focus-panel]"),
    }));
    console.log(`[CERT staff lens record gesture] ${JSON.stringify(outcome)}`);
    expect(outcome.drawer).toBe(false);
    expect(outcome.rosterOwnedDetail).toBe(false);
    // Either it landed, or the platform said in words that it cannot. Silence is
    // the one unacceptable outcome.
    expect(outcome.focusPanel || outcome.refused).toBe(true);
});
