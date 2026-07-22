/**
 * P3 verification — compact pattern selector (chips, not a dropdown); the day pills
 * are the source of truth and editing them away from the template shows "Custom".
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

test("compact pattern chips + day pills as source of truth (Custom on deviation)", async ({ page }) => {
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
    await page.waitForTimeout(3500);

    const selector = page.locator('[data-pattern-selector="true"]');
    const chips = page.locator("[data-pattern]");
    const patternDropdowns = page.locator('[data-schedule-surface="true"] select');
    const chipCount = await chips.count();
    console.log("PATTERN_SELECTOR_COUNT=" + (await selector.count()));
    console.log("PATTERN_CHIP_COUNT=" + chipCount);
    console.log("SURFACE_SELECT_COUNT=" + (await patternDropdowns.count()));
    console.log("CUSTOM_BEFORE=" + (await page.locator('[data-pattern-custom="true"]').count()));
    await snap(page, "p3-00-pattern-chips");

    // Toggle a day off the template → the schedule becomes Custom.
    const firstOnDay = page.locator('[data-day][aria-pressed="true"]').first();
    await firstOnDay.click();
    await page.waitForTimeout(600);
    const customAfter = await page.locator('[data-pattern-custom="true"]').count();
    console.log("CUSTOM_AFTER=" + customAfter);
    await snap(page, "p3-10-custom");

    console.log("PAGE_ERRORS=" + JSON.stringify([...new Set(errors)].slice(0, 5)));

    expect(await selector.count(), "pattern selector renders").toBeGreaterThan(0);
    expect(chipCount, "pattern chips present").toBeGreaterThan(0);
    expect(await patternDropdowns.count(), "no <select> dropdown in the surface").toBe(0);
    expect(customAfter, "editing days shows Custom").toBeGreaterThan(0);
});
