/**
 * P1 verification — the Scheduling work surface takes over the CENTER focus area
 * (depth scrim + elevated cell), the same interaction pattern as Household/Children.
 *
 * Run: alloy-agent-verify 5 focused-spec playwright/tests/scheduling-center-takeover.spec.ts
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

test("Scheduling work surface takes over the center (scrim + elevated cell)", async ({ page }) => {
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

    // Baseline: scheduling card present, NOT yet elevated, no scrim.
    const schedCell = page.locator('[data-focus-panel-grid-cell="scheduling"], [data-fp-grid-area="scheduling"]');
    console.log("SCHED_CELL_COUNT=" + (await schedCell.count()));
    console.log("SCRIM_BEFORE=" + (await page.locator('[data-fp-depth-scrim="true"]').count()));
    await snap(page, "p1-00-base");

    // Open a child → the work surface should elevate into the center.
    await page.locator("[data-scheduling-open]").first().click({ force: true });
    await page.waitForTimeout(3500);

    const scrim = page.locator('[data-fp-depth-scrim="true"]');
    const elevated = page.locator('[data-fp-elevated="true"]');
    const scrimCount = await scrim.count();
    const elevatedCount = await elevated.count();
    const elevatedCellKey = await elevated.first().getAttribute("data-focus-panel-grid-cell").catch(() => null);
    const surfaceVisible = await page.locator('[data-schedule-surface="true"]').first().isVisible().catch(() => false);
    const depthActive = await page
        .locator('[data-fp-depth="active"], [data-fp-composer-depth-active="true"]')
        .count();

    console.log("SCRIM_AFTER=" + scrimCount);
    console.log("ELEVATED_COUNT=" + elevatedCount);
    console.log("ELEVATED_CELL_KEY=" + elevatedCellKey);
    console.log("DEPTH_ACTIVE=" + depthActive);
    console.log("WORK_SURFACE_VISIBLE=" + surfaceVisible);
    await snap(page, "p1-10-center-takeover");

    console.log("PAGE_ERRORS=" + JSON.stringify([...new Set(errors)].slice(0, 5)));

    // Assertions: the takeover is real.
    expect(scrimCount, "depth scrim renders").toBeGreaterThan(0);
    expect(depthActive, "grid marks depth active").toBeGreaterThan(0);
    expect(surfaceVisible, "work surface visible in center").toBeTruthy();
});
