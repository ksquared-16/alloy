import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Roster is ONE surface with a Day/Week range, and it leads with the problems.
 *
 * Before: two Work tabs called "Roster" and "Daily Roster", reading the same
 * subject matter through two projections and telling different staffing stories,
 * with rooms ordered alphabetically — which put the only room with children in it
 * last, below the fold, behind two rooms nobody is in.
 *
 * What this proves:
 *   1. the tab list is Overview · Assignments · Roster · Attendance
 *   2. Roster opens on Day and the range control switches to Week and back
 *   3. rooms are ordered by attention, not by name
 *   4. the site attention line renders counts both read models always computed
 *   5. a `daily_roster` deep link still lands on Roster, at the Day range
 */

const SHOTS = path.join(__dirname, "..", "evidence", "roster-product-audit");
const SETTLE = 120_000;
const SCHEDULING = "[data-adminv2-scheduling-workspace]";
const TODDLER_A = "00000000-0000-4000-8000-000000000013";

test.beforeAll(() => fs.mkdirSync(SHOTS, { recursive: true }));

async function openRoster(page: Page, deepLinkView: string) {
    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");
    await page.evaluate((view) => {
        sessionStorage.setItem(
            "alloy.assignments.workspace.deeplink",
            JSON.stringify({ mode: "work", workView: view }),
        );
    }, deepLinkView);
    await page.locator('[data-adminv2-sidebar-modal-nav="scheduling"]').click();
    await page.locator(SCHEDULING).waitFor({ timeout: SETTLE });
    await page.locator('button[aria-label="Site"]').first().click();
    await page.locator("[role=option]", { hasText: "Riverside" }).first().click();
}

test("Roster is one surface with a Day/Week range, and there is no second Roster tab", async ({
    page,
}) => {
    await openRoster(page, "roster");
    await expect(page.locator("[data-roster-range]")).toBeVisible({ timeout: SETTLE });

    const tabs = await page.evaluate(() => {
        const scope = document.querySelector("[data-adminv2-scheduling-workspace]");
        return [...(scope?.querySelectorAll("[data-scheduling-section-tab]") ?? [])].map((el) =>
            (el.textContent ?? "").trim(),
        );
    });
    console.log(`[CERT roster tabs] ${JSON.stringify(tabs)}`);
    if (tabs.length > 0) {
        expect(tabs).toEqual(["Overview", "Assignments", "Roster", "Attendance"]);
    } else {
        // Tab chrome carries no dedicated hook in this shell; assert on the text
        // instead rather than silently proving nothing.
        const chrome = await page
            .locator(SCHEDULING)
            .innerText()
            .then((t) => t.replace(/\s+/g, " "));
        expect(chrome).toContain("Assignments");
        expect(chrome).not.toContain("Daily Roster");
    }

    // Opens on Day.
    await expect(page.locator("[data-roster-range]")).toHaveAttribute("data-roster-range", "day");
    await expect(page.locator("[data-daily-roster]")).toBeVisible();
    await expect(page.locator("[data-roster-date]")).toBeVisible();

    // Switch to Week — same surface, different range.
    await page.locator('[data-roster-range-option="week"]').click();
    await expect(page.locator("[data-scheduling-roster]")).toBeVisible({ timeout: SETTLE });
    await expect(page.locator("[data-roster-week-label]")).toBeVisible({ timeout: SETTLE });
    await expect(page.locator("[data-daily-roster]")).toHaveCount(0);
    await page.screenshot({ path: path.join(SHOTS, "60-roster-week-range.png"), fullPage: true });

    // …and back.
    await page.locator('[data-roster-range-option="day"]').click();
    await expect(page.locator("[data-daily-roster]")).toBeVisible({ timeout: SETTLE });
    await page.screenshot({ path: path.join(SHOTS, "61-roster-day-range.png"), fullPage: true });
});

test("rooms lead with the ones needing attention, not with the alphabet", async ({ page }) => {
    await openRoster(page, "roster");
    await expect(page.locator(`[data-roster-room="${TODDLER_A}"]`)).toBeVisible({ timeout: SETTLE });

    const order = await page.evaluate(() =>
        [...document.querySelectorAll("[data-roster-room]")].map((el) => ({
            id: el.getAttribute("data-roster-room"),
            state: el.getAttribute("data-roster-state"),
            name: (el.querySelector("h3")?.textContent ?? "").trim(),
        })),
    );
    console.log(`[CERT roster order] ${JSON.stringify(order)}`);

    // Toddler Room A is the only room anyone is in. Alphabetically it is last;
    // by attention it is first, because the other two are empty AND unconfigured.
    expect(order[0]?.id).toBe(TODDLER_A);
    expect(order.map((r) => r.name)).not.toEqual(
        [...order.map((r) => r.name)].sort((a, b) => a.localeCompare(b)),
    );

    // The empty unconfigured rooms are `unknown` but must not raise an alarm about
    // a campus where nothing is happening.
    const emptyUnknown = order.filter((r) => r.state === "unknown");
    expect(emptyUnknown.length).toBeGreaterThan(0);
    await expect(page.locator("[data-roster-attention]")).toHaveCount(0);
});

test("the attention line names the rooms that are short", async ({ page }) => {
    await openRoster(page, "roster");
    await expect(page.locator("[data-roster-range]")).toBeVisible({ timeout: SETTLE });
    await page.locator('[data-roster-range-option="week"]').click();
    await expect(page.locator("[data-roster-week-label]")).toBeVisible({ timeout: SETTLE });

    // The week of 6 Jul 2026 has children in Toddler Room A and no staff assignment
    // yet — one room short, and the line has to say so.
    await page.locator("[data-week-picker-trigger]").first().click();
    await page.locator('[data-week-picker-option="2026-07-06"]').click();
    await expect(page.locator("[data-roster-week-label]").first()).toHaveText(/Jul 6/, {
        timeout: SETTLE,
    });

    const attention = page.locator("[data-roster-attention]");
    await expect(attention).toBeVisible({ timeout: SETTLE });
    await expect(attention).toHaveText(/1 room short/);
    console.log(`[CERT attention] ${await attention.textContent()}`);

    // And the short room sorts to the top of the board.
    const firstRoom = await page.evaluate(
        () =>
            document
                .querySelector("[data-scheduling-roster-room]")
                ?.getAttribute("data-scheduling-roster-room") ?? null,
    );
    expect(firstRoom).toBe(TODDLER_A);
    await page.screenshot({ path: path.join(SHOTS, "62-roster-attention.png"), fullPage: true });
});

test("the range switch keeps the operator at the same moment in time", async ({ page }) => {
    await openRoster(page, "roster");
    const dateInput = page.locator("[data-roster-date]");
    await expect(dateInput).toBeVisible({ timeout: SETTLE });

    // Move three days out from today, so the chosen day is unambiguous.
    for (let i = 0; i < 3; i += 1) await page.locator("[data-roster-next-day]").click();
    const chosen = await dateInput.inputValue();
    console.log(`[CERT range-switch chosen day] ${chosen}`);
    expect(chosen).toBeTruthy();

    // Day → Week must show the week CONTAINING that day, not "this week".
    await page.locator('[data-roster-range-option="week"]').click();
    await expect(page.locator("[data-roster-week-label]")).toBeVisible({ timeout: SETTLE });
    const weekLabel = (await page.locator("[data-roster-week-label]").first().textContent()) ?? "";
    console.log(`[CERT range-switch week] ${weekLabel}`);

    // Week → Day must come back inside that same week, not reset to today.
    await page.locator('[data-roster-range-option="day"]').click();
    await expect(page.locator("[data-daily-roster]")).toBeVisible({ timeout: SETTLE });
    const returned = await dateInput.inputValue();
    console.log(`[CERT range-switch returned day] ${returned}`);
    expect(returned).toBeTruthy();

    // Same week, either the same day or today-within-it — never a silent reset to
    // a week the operator was not looking at.
    const mondayOf = (ymd: string) => {
        const d = new Date(`${ymd}T00:00:00`);
        const shift = d.getDay() === 0 ? -6 : 1 - d.getDay();
        d.setDate(d.getDate() + shift);
        return d.toISOString().slice(0, 10);
    };
    expect(mondayOf(returned)).toBe(mondayOf(chosen));
});

test("a daily_roster deep link still lands on Roster, at the Day range", async ({ page }) => {
    await openRoster(page, "daily_roster");
    await expect(page.locator("[data-roster-range]")).toHaveAttribute("data-roster-range", "day", {
        timeout: SETTLE,
    });
    await expect(page.locator("[data-daily-roster]")).toBeVisible();
});
