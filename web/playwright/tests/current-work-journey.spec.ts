import { config as loadEnv } from "dotenv";
import * as path from "path";
import { test, expect, type Page } from "@playwright/test";

import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

const LIVE = process.env.PLAYWRIGHT_CURRENT_WORK === "1";
const WORK_UNIT_SLUGS = (process.env.CURRENT_WORK_SLUGS || "lifecycle-lead,new-leads,leads")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const ROW_SELECTOR = "[data-alloy-os-compressed-row='true']";

async function openFirstLeadRecord(page: Page): Promise<boolean> {
    for (const slug of WORK_UNIT_SLUGS) {
        await page.goto(`/workspace/work-unit/${slug}`, { waitUntil: "domcontentloaded", timeout: 120_000 }).catch(() => {});
        const pathname = new URL(page.url()).pathname;
        if (pathname === "/login" || pathname.startsWith("/unauthorized")) continue;

        const row = page.locator(ROW_SELECTOR).first();
        const visible = await row.waitFor({ state: "visible", timeout: 25_000 }).then(() => true).catch(() => false);
        if (!visible) continue;

        await row.click();
        const panel = page.locator("[data-focus-panel-card-grid='true']").first();
        const opened = await panel.waitFor({ state: "visible", timeout: 90_000 }).then(() => true).catch(() => false);
        if (opened) return true;
    }
    return false;
}

test.describe("Current Work journey", () => {
    test.skip(!LIVE, "Set PLAYWRIGHT_CURRENT_WORK=1 for authenticated Current Work journey");
    test.describe.configure({ timeout: 300_000 });

    test.beforeEach(async ({ page }) => {
        await ensureAdminPlaywrightSession(page);
    });

    test("Lead record — Focus, Communications handoff, outcome completion", async ({ page }) => {
        test.setTimeout(300_000);
        await page.setViewportSize({ width: 1680, height: 1050 });

        const opened = await openFirstLeadRecord(page);
        expect(opened).toBe(true);

        const currentWork = page.locator('[data-universal-card-key="current_work"]').first();
        await expect(currentWork).toBeVisible({ timeout: 60_000 });
        await expect(currentWork).not.toContainText("Review Lead");

        const openWork = currentWork.locator('[data-work-action="open"], [data-work-action="complete"]').first();
        await expect(openWork).toBeVisible();
        await openWork.click();

        await expect(page.locator('[data-work-card-perspective="focused"]').first()).toBeVisible({ timeout: 15_000 });

        const contactRow = page.locator('[data-work-checklist-item]').filter({ hasText: /Contact/i }).first();
        if (await contactRow.count()) {
            await contactRow.click();
            await page.waitForTimeout(800);
            const commsFocused =
                (await page.locator('[data-universal-card-key="communications"][data-card-perspective="focused"]').count()) > 0
                || (await page.locator('[data-focus-panel-mode="activity"]').count()) > 0;
            expect(commsFocused).toBeTruthy();

            await page.keyboard.press("Escape").catch(() => {});
            await page.waitForTimeout(400);
        }

        const completeCta = page.locator('[data-work-action="complete"]').first();
        if (await completeCta.count()) {
            await completeCta.click();
            const firstOutcome = page.locator("[data-testid^='stage-work-outcome-']").first();
            if (await firstOutcome.count()) {
                await firstOutcome.click();
                const confirm = page.locator("[data-testid='stage-work-outcome-confirm-submit']").first();
                if (await confirm.count()) {
                    await confirm.click();
                    await page.waitForTimeout(1500);
                }
            }
        }

        await expect(page.locator('[data-universal-card-key="current_work"]').first()).toBeVisible();
        await expect(page.locator('[data-universal-card-key="current_work"]').first()).not.toContainText("Review Lead");
    });
});
