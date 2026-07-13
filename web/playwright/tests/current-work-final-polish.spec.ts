/**
 * Current Work final polish — viewport fit + Process Builder ownership screenshots.
 * Run: PLAYWRIGHT_CURRENT_WORK_POLISH=1 npx playwright test playwright/tests/current-work-final-polish.spec.ts
 */
import { config as loadEnv } from "dotenv";
import { execSync } from "node:child_process";
import * as fs from "fs";
import * as path from "path";
import { test, expect, type Page } from "@playwright/test";

import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

const LIVE = process.env.PLAYWRIGHT_CURRENT_WORK_POLISH === "1";
const EVIDENCE_DIR = path.resolve(
    __dirname,
    "../../../docs/sprints/07_2026/current-work-final-product-polish/evidence",
);
const FIXTURE_HTML = path.join(EVIDENCE_DIR, "collapsed-card-fixture.html");

async function assertCollapsedCardFits(page: Page, label: string, allowOverflowViewport = false) {
    const card = page.locator('[data-universal-card-key="current_work"]').first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.locator('[data-work-action="open-work"]')).toBeVisible();
    await expect(card.locator('[data-work-summary="true"]')).toBeVisible();

    const hasInternalScroll = await card.evaluate((el) => el.scrollHeight > el.clientHeight + 2);
    expect(hasInternalScroll).toBe(false);

    const box = await card.boundingBox();
    expect(box).toBeTruthy();
    if (!allowOverflowViewport) {
        const viewport = page.viewportSize()!;
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 2);
    }

    await card.screenshot({
        path: path.join(EVIDENCE_DIR, `${label}.png`),
    });
}

test.describe("Current Work final polish viewport", () => {
    test.skip(!LIVE, "Set PLAYWRIGHT_CURRENT_WORK_POLISH=1 for live polish certification");
    test.describe.configure({ timeout: 300_000 });

    test.beforeAll(() => {
        fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
        execSync(
            "npm run test -- tests/adminV2/runtime/currentWorkPolishFixtureExport.test.tsx",
            {
                cwd: path.join(__dirname, "../.."),
                stdio: "inherit",
                env: process.env,
            },
        );
        expect(fs.existsSync(FIXTURE_HTML)).toBe(true);
    });

    test("Process Builder Work Template has no Alternate Paths authoring", async ({ page }) => {
        await ensureAdminPlaywrightSession(page);
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto("/settings/processes", { waitUntil: "domcontentloaded", timeout: 120_000 });
        await expect(page.getByRole("heading", { name: "Processes" })).toBeVisible({ timeout: 60_000 });

        await page.getByRole("button", { name: /1 Lead|Lead Family|^Lead/i }).first().click();
        await page.getByRole("button", { name: /Operational Experience/i }).first().click();
        await page.waitForTimeout(400);
        const workItems = page.getByRole("button", { name: /Work items/i }).first();
        if (await workItems.count()) {
            await workItems.click();
            await page.waitForTimeout(300);
        }
        const contact = page.getByRole("button", { name: /^Contact Family$/i }).first();
        if (await contact.count()) {
            await contact.click();
            await page.waitForTimeout(500);
        }
        await expect(page.getByText("Alternate Paths", { exact: true })).toHaveCount(0);
        // Prefer seeing the Work Template editor note; fall back to Helpful Actions heading after selecting a work item.
        const helpful = page.getByText("Helpful Actions").first();
        const transitionsNote = page.locator("[data-testid^='work-template-transitions-note']").first();
        if (await contact.count()) {
            await expect(helpful.or(transitionsNote)).toBeVisible({ timeout: 15_000 });
        }
        await page.screenshot({
            path: path.join(EVIDENCE_DIR, "08-work-template-editor-no-alternate-paths.png"),
            fullPage: false,
        });
    });

    test("Collapsed Current Work fits at required viewports", async ({ page }) => {
        await page.goto(`file://${FIXTURE_HTML}`);

        const viewports: Array<{ w: number; h: number; label: string }> = [
            { w: 1280, h: 720, label: "01-collapsed-1280x720" },
            { w: 1440, h: 900, label: "02-collapsed-1440x900" },
            { w: 1680, h: 1050, label: "03-collapsed-1680x1050" },
        ];

        for (const vp of viewports) {
            await page.setViewportSize({ width: vp.w, height: vp.h });
            await page.waitForTimeout(200);
            await assertCollapsedCardFits(page, vp.label);
        }

        await page.setViewportSize({ width: 1280, height: 720 });
        await page.evaluate(() => {
            document.documentElement.style.zoom = "1.25";
        });
        await page.waitForTimeout(200);
        await assertCollapsedCardFits(page, "04-collapsed-125pct-zoom", true);

        const card = page.locator('[data-universal-card-key="current_work"]').first();
        await expect(card).not.toContainText("Alternate paths");
        await expect(card).not.toContainText("Helpful actions");
        await expect(card.locator('[data-work-action="open-work"]')).toBeVisible();
        await expect(card.locator('[data-work-primary-row="true"]')).toBeVisible();
        await expect(card.locator('[data-work-progress="true"]')).toBeVisible();
    });
});
