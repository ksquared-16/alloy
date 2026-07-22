/**
 * P7 verification — a proposed schedule SAVES for a lead-stage Kurzman child.
 * The ensure-OCM path must create the opportunity_customer_member link so the
 * desired schedule intent (schedule_type · room · start · times) persists.
 *
 * Success = the confirmation "Proposed schedule saved — becomes operational at
 * enrollment." — NOT the prior "Couldn't link this child to an enrollment record".
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

test("proposed schedule saves for a lead-stage Kurzman child (ensure-OCM)", async ({ page }) => {
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
    await page.locator("[data-pattern]").first().waitFor({ timeout: 20000 });
    // Let options + billing resolve so the recommended room is selected.
    await page.waitForTimeout(6000);

    // Set daily hours + effective start.
    await page.locator('[data-arrive="true"]').fill("07:30");
    await page.locator('[data-depart="true"]').fill("17:30");
    const dateInput = page.locator('[data-schedule-surface="true"] input[type="date"]').first();
    await dateInput.fill("2026-08-04");
    await page.waitForTimeout(800);

    const commit = page.locator('[data-schedule-commit="true"]').first();
    console.log("SAVE_ENABLED=" + (await commit.isEnabled()));
    await snap(page, "p7-00-before-save");
    await commit.click({ force: true });
    await page.waitForTimeout(5000);

    const surfaceText = await page.locator('[data-scheduling-card="true"]').first().innerText().catch(() => "");
    const flat = surfaceText.replace(/\n+/g, " | ").slice(0, 240);
    console.log("RESULT_TEXT=" + JSON.stringify(flat));
    console.log("PAGE_ERRORS=" + JSON.stringify([...new Set(errors)].slice(0, 5)));
    await snap(page, "p7-10-after-save");

    expect(flat, "no ensure-OCM failure").not.toContain("Couldn't link");
    expect(flat, "proposed schedule saved confirmation").toContain("Proposed schedule saved");
});
