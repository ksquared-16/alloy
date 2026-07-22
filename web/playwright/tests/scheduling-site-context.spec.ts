/**
 * P2 verification — the Scheduling builder resolves Site from operational context
 * (the Kurzman lead is North Campus) and presents it as a fact, not a picker.
 *
 * Run: PLAYWRIGHT_BASE_URL/STORAGE_STATE for slot 5, chromium.
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

test("Site resolves from context and shows as a fact, not a picker", async ({ page }) => {
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

    const contextLine = page.locator('[data-schedule-site-context="true"]');
    const siteSelect = page.locator('[data-schedule-site-select="true"]');
    const contextCount = await contextLine.count();
    const selectCount = await siteSelect.count();
    const contextText = contextCount ? (await contextLine.first().innerText()).replace(/\n+/g, " ").trim() : "";

    console.log("SITE_CONTEXT_COUNT=" + contextCount);
    console.log("SITE_CONTEXT_TEXT=" + JSON.stringify(contextText));
    console.log("SITE_SELECT_COUNT=" + selectCount);
    console.log("PAGE_ERRORS=" + JSON.stringify([...new Set(errors)].slice(0, 5)));
    await snap(page, "p2-site-context");

    expect(contextCount, "site rendered as context fact").toBeGreaterThan(0);
    expect(contextText, "resolved to North Campus").toContain("North Campus");
    expect(selectCount, "no site picker when unambiguous").toBe(0);
});
