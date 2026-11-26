/**
 * Digital Mailroom Product Identity — capture Overview / Work / Studio screenshots.
 *
 * Run (dev server on :3001):
 *   cd web && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 npx playwright test playwright/tests/digital-mailroom-identity-screenshots.spec.ts
 */
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
import { test, expect } from "@playwright/test";
import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const SCREENSHOT_DIR = path.join(process.cwd(), "../docs/sprints/archive/07_2026/digital-mailroom-identity-screenshots");

async function snap(page: import("@playwright/test").Page, name: string) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: false });
}

async function openProcessingModal(page: import("@playwright/test").Page) {
    await page.locator('[data-adminv2-app-shell="workspace-v2"]').waitFor({ state: "visible", timeout: 60_000 });
    const trigger = page.getByRole("button", { name: /Processing — intake/i });
    await expect(trigger).toBeVisible({ timeout: 60_000 });
    await trigger.click();
    const modal = page.locator('[data-adminv2-processing-modal="true"]');
    try {
        await expect(modal).toBeVisible({ timeout: 20_000 });
    } catch {
        await page.evaluate(() => {
            window.dispatchEvent(new Event("adminv2:open-processing-modal"));
        });
        await trigger.click();
        await expect(modal).toBeVisible({ timeout: 60_000 });
    }
}

test.describe("Digital Mailroom identity screenshots", () => {
    test.setTimeout(120_000);

    test.beforeEach(async ({ page }) => {
        await ensureAdminPlaywrightSession(page);
    });

    test("capture Overview, Work, Studio", async ({ page }) => {
        await openProcessingModal(page);

        await expect(page.getByTestId("processing-overview-landing")).toBeVisible({ timeout: 15_000 });
        await snap(page, "01-overview");

        await page.locator('[data-workspace-section-tab="work"]').click();
        await expect(page.locator('[data-processing-folder-tree="true"]')).toBeVisible({ timeout: 10_000 });
        await snap(page, "02-work-queue");

        const firstCase = page.locator("[data-processing-case-id]").first();
        if (await firstCase.isVisible().catch(() => false)) {
            await firstCase.click();
            await expect(page.getByRole("list", { name: "Document to form workflow" })).toBeVisible({ timeout: 30_000 });
            await snap(page, "03-work-review");
        }

        await page.locator('[data-alloy-mode="studio"]').click();
        await expect(page.getByTestId("processing-studio-shell")).toBeVisible({ timeout: 10_000 });
        await snap(page, "04-studio-forms");
    });
});
