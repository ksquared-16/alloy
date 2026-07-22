/**
 * P4 verification — daily time ranges are part of the schedule definition:
 * a default Arrive/Depart plus optional per-day overrides.
 */
import * as fs from "fs";
import * as path from "path";
import { test, expect, type Page } from "@playwright/test";

const SHOT_DIR =
    process.env.SCHEDULING_SHOT_DIR ||
    "/private/tmp/claude-502/-Users-Kelly-Alloy--claude-worktrees-scheduling-v1-impl-7c7908/bf1e5f44-0762-443b-94ae-0c32300886ba/scratchpad/scheduling-evidence";

async function snap(page: Page, name: string) {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: true });
}

test("daily hours: default arrive/depart + per-day overrides", async ({ page }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));

    await page.goto("/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);
    await page.getByText("Kurzman Family", { exact: false }).first().click();
    await page.waitForTimeout(11000);
    const bosClose = page.getByRole("button", { name: /^close$/i }).first();
    if (await bosClose.count()) await bosClose.click().catch(() => {});
    await page.waitForTimeout(800);

    await page.locator("[data-scheduling-open]").first().click({ force: true });
    await page.locator('[data-schedule-surface="true"]').first().waitFor({ timeout: 20000 });
    await page.locator('[data-pattern]').first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(600);

    const section = page.locator('[data-daily-hours="true"]');
    console.log("DAILY_HOURS_SECTION=" + (await section.count()));
    const arrive = page.locator('[data-arrive="true"]');
    const depart = page.locator('[data-depart="true"]');
    console.log("ARRIVE_INPUT=" + (await arrive.count()) + " DEPART_INPUT=" + (await depart.count()));

    // Set default hours.
    await arrive.fill("07:30");
    await depart.fill("17:30");
    await page.waitForTimeout(300);

    // Open per-day overrides.
    const toggle = page.locator('[data-perday-toggle="true"]');
    const toggleCount = await toggle.count();
    console.log("PERDAY_TOGGLE=" + toggleCount);
    if (toggleCount) {
        await toggle.check();
        await page.waitForTimeout(400);
    }
    const rows = page.locator("[data-perday-row]");
    console.log("PERDAY_ROWS=" + (await rows.count()));
    await snap(page, "p4-daily-hours");

    console.log("PAGE_ERRORS=" + JSON.stringify([...new Set(errors)].slice(0, 5)));

    expect(await section.count(), "daily hours section renders").toBeGreaterThan(0);
    expect(await arrive.count(), "arrive input").toBeGreaterThan(0);
    expect(await depart.count(), "depart input").toBeGreaterThan(0);
    expect(await arrive.inputValue(), "arrive value set").toBe("07:30");
    expect(errors.length, "no page errors").toBe(0);
});
