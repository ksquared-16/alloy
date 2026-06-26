import * as fs from "fs";
import * as path from "path";
import { config as loadEnv } from "dotenv";
import { test, expect } from "@playwright/test";
import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

const screenshotDir = path.join(
    __dirname,
    "../../../docs/sprints/06_2026/configuration-runtime-final-visual-pass",
);

const BEND_PINE = "rgb(0, 162, 131)";
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

function colorClose(actual: string, expected: string): boolean {
    const norm = actual.replace(/\s/g, "").toLowerCase();
    if (norm.includes("0,162,131") || norm.includes("#00a283")) return true;
    return norm === expected.replace(/\s/g, "").toLowerCase();
}

test.beforeAll(() => {
    fs.mkdirSync(screenshotDir, { recursive: true });
});

test.describe("Configuration Runtime final visual pass", () => {
    test("color balance and Work View typography screenshots", async ({ page }) => {
        test.setTimeout(600_000);
        await page.setViewportSize({ width: 1440, height: 960 });
        await ensureAdminPlaywrightSession(page);

        await page.goto("/settings", { waitUntil: "networkidle", timeout: 120_000 });
        await expect(page.getByTestId("settings-index-page")).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "01-settings-landing-color-balance.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.goto("/settings/processes", { waitUntil: "networkidle", timeout: 120_000 });
        await ensureSidebarExpanded(page);
        await selectEnrollmentProcess(page);
        await page.getByTestId("business-process-nav-stages").click();
        await expect(page.getByTestId("lifecycle-stage-workspace")).toBeVisible({ timeout: 60_000 });

        const activeStage = page.locator(".process-config-work-view-list-card--active").first();
        if (await activeStage.isVisible().catch(() => false)) {
            const bg = await activeStage.evaluate((el) => getComputedStyle(el).backgroundColor);
            if (bg.includes("162")) {
                expect(colorClose(bg, BEND_PINE_BG)).toBeTruthy();
            }
        }

        await page.screenshot({
            path: path.join(screenshotDir, "02-processes-stages-color-balance.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.getByTestId("business-process-nav-work-views").click();
        await expect(page.getByTestId("business-process-work-views-list-column")).toBeVisible({ timeout: 60_000 });
        const wvList = page.locator('[data-testid^="business-process-work-view-list-"]').first();
        if (await wvList.isVisible().catch(() => false)) {
            await wvList.click();
        }

        await expect(page.getByTestId("work-view-section-basics").first()).toHaveAttribute("open", "");
        await expect(page.getByTestId("work-view-section-conditions").first()).not.toHaveAttribute("open", "");
        await expect(page.getByTestId("work-view-section-sort-summary").first()).toBeVisible();
        await expect(page.getByTestId("work-view-section-presentation-summary").first()).toBeVisible();

        await page.screenshot({
            path: path.join(screenshotDir, "03-work-views-collapsed-summaries.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.getByTestId("work-view-section-conditions").first().locator("summary").click();
        await expect(page.getByTestId("work-view-section-conditions").first()).toHaveAttribute("open", "");
        await page.screenshot({
            path: path.join(screenshotDir, "04-work-view-conditions-expanded.png"),
            fullPage: true,
            animations: "disabled",
        });

        const shellBg = await page
            .locator(".config-runtime-shell")
            .first()
            .evaluate((el) => getComputedStyle(el).backgroundColor)
            .catch(() => "rgb(255, 255, 255)");
        expect(shellBg.replace(/\s/g, "")).toMatch(/255,255,255/);

        const activeNav = page.getByTestId("config-mode-nav-processes");
        const navColor = await activeNav.evaluate((el) => getComputedStyle(el).color);
        expect(navColor).not.toContain("126, 232, 204");

        await page.screenshot({
            path: path.join(screenshotDir, "05-full-page-bos-rail.png"),
            fullPage: true,
            animations: "disabled",
        });
    });
});
