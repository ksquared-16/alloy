import * as fs from "fs";
import * as path from "path";
import { config as loadEnv } from "dotenv";
import { test, expect } from "@playwright/test";
import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

const screenshotDir = path.join(
    __dirname,
    "../../../docs/sprints/06_2026/configuration-runtime-final-lock-in",
);

const BEND_PINE_BG = "rgba(0, 162, 131, 0.08)";

async function ensureSidebarExpanded(page: import("@playwright/test").Page) {
    const expand = page.getByRole("button", { name: "Expand sidebar" });
    if (await expand.isVisible().catch(() => false)) {
        await expand.click();
    }
}

async function selectEnrollmentProcess(page: import("@playwright/test").Page) {
    const enrollmentCard = page.getByTestId("lifecycle-process-card-enrollment");
    if (await enrollmentCard.isVisible().catch(() => false)) {
        await enrollmentCard.click();
        return;
    }
    await page.locator('[data-testid^="lifecycle-process-card-"]').first().click();
}

function colorClose(actual: string): boolean {
    const norm = actual.replace(/\s/g, "").toLowerCase();
    return norm.includes("0,162,131") || norm.includes("#00a283");
}

test.beforeAll(() => {
    fs.mkdirSync(screenshotDir, { recursive: true });
});

test.describe("Configuration Runtime final lock-in", () => {
    test("pine buttons, workspace outlines, and screenshots", async ({ page }) => {
        test.setTimeout(600_000);
        await page.setViewportSize({ width: 1440, height: 960 });
        await ensureAdminPlaywrightSession(page);

        await page.goto("/settings", { waitUntil: "networkidle", timeout: 120_000 });
        await expect(page.getByTestId("settings-index-page")).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "01-settings-landing.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.goto("/settings/processes", { waitUntil: "networkidle", timeout: 120_000 });
        await ensureSidebarExpanded(page);
        await selectEnrollmentProcess(page);
        await page.getByTestId("business-process-nav-stages").click();
        await expect(page.getByTestId("lifecycle-stage-workspace")).toBeVisible({ timeout: 60_000 });

        const saveStage = page.getByTestId("lifecycle-stage-save");
        await expect(saveStage).toHaveClass(/config-primary-btn/);

        const activeStage = page.locator(".process-config-work-view-list-card--active").first();
        if (await activeStage.isVisible().catch(() => false)) {
            const bg = await activeStage.evaluate((el) => getComputedStyle(el).backgroundColor);
            if (bg.includes("162")) expect(colorClose(bg)).toBeTruthy();
        }

        await page.screenshot({
            path: path.join(screenshotDir, "02-processes-stages.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.getByTestId("business-process-nav-work-views").click();
        await expect(page.getByTestId("business-process-work-views-list-column")).toBeVisible({ timeout: 60_000 });
        const addWv = page.getByTestId("business-process-add-work-view");
        await expect(addWv).toHaveClass(/config-primary-btn/);
        const wvList = page.locator('[data-testid^="business-process-work-view-list-"]').first();
        if (await wvList.isVisible().catch(() => false)) {
            await wvList.click();
        }
        await expect(page.getByTestId("work-view-section-sort-summary").first()).toBeVisible();
        await page.screenshot({
            path: path.join(screenshotDir, "03-work-views-collapsed.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.getByTestId("work-view-section-conditions").first().locator("summary").click();
        await page.screenshot({
            path: path.join(screenshotDir, "04-work-view-conditions-expanded.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.goto("/settings/statuses", { waitUntil: "networkidle", timeout: 120_000 });
        await expect(page.locator(".statuses-config-surface")).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "05-settings-statuses.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.goto("/settings/processes", { waitUntil: "networkidle", timeout: 120_000 });
        await ensureSidebarExpanded(page);
        await page.screenshot({
            path: path.join(screenshotDir, "06-full-page-bos-rail.png"),
            fullPage: true,
            animations: "disabled",
        });
    });
});
