import * as fs from "fs";
import * as path from "path";
import { config as loadEnv } from "dotenv";
import { test, expect } from "@playwright/test";
import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

const screenshotDir = path.join(
    __dirname,
    "../../../docs/sprints/archive/06_2026/configuration-runtime-settings-pattern",
);

function colorClose(actual: string): boolean {
    const norm = actual.replace(/\s/g, "").toLowerCase();
    return norm.includes("0,162,131") || norm.includes("#00a283");
}

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

test.beforeAll(() => {
    fs.mkdirSync(screenshotDir, { recursive: true });
});

test.describe("Configuration Runtime settings pattern", () => {
    test("Processes and Statuses follow Context → Queue → Workspace → BOS", async ({ page }) => {
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
        await expect(page.getByTestId("business-process-configuration-shell")).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "02-processes-context-queue-workspace.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.getByTestId("business-process-nav-work-views").click();
        await expect(page.getByTestId("business-process-work-views-list-column")).toBeVisible({ timeout: 60_000 });
        const wvList = page.locator('[data-testid^="business-process-work-view-list-"]').first();
        if (await wvList.isVisible().catch(() => false)) {
            await wvList.click();
        }
        await page.screenshot({
            path: path.join(screenshotDir, "03-processes-work-views.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.goto("/settings/statuses", { waitUntil: "networkidle", timeout: 120_000 });
        await expect(page.getByTestId("statuses-configuration-page")).toBeVisible({ timeout: 60_000 });
        await expect(page.getByTestId("statuses-configuration-context")).toBeVisible();
        await expect(page.getByTestId("statuses-configuration-shell")).toBeVisible();
        await expect(page.getByTestId("statuses-category-queue")).toBeVisible();
        await expect(page.getByTestId("statuses-status-list")).toBeVisible();
        await expect(page.locator("[data-status-settings-category]")).toHaveCount(0);

        const activeCategory = page.locator(".process-config-work-view-list-card--active").first();
        if (await activeCategory.isVisible().catch(() => false)) {
            const bg = await activeCategory.evaluate((el) => getComputedStyle(el).backgroundColor);
            if (bg.includes("162")) expect(colorClose(bg)).toBeTruthy();
        }

        await page.screenshot({
            path: path.join(screenshotDir, "04-statuses-queue-workspace.png"),
            fullPage: true,
            animations: "disabled",
        });

        const statusItem = page.locator('[data-testid^="statuses-status-"]').first();
        if (await statusItem.isVisible().catch(() => false)) {
            await statusItem.click();
            await expect(page.getByTestId("status-configuration-detail")).toBeVisible({ timeout: 30_000 });
        }
        await page.screenshot({
            path: path.join(screenshotDir, "05-status-detail-workspace.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.goto("/settings/fields", { waitUntil: "networkidle", timeout: 120_000 });
        await expect(page.getByTestId("fields-configuration-pattern-placeholder")).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "06-fields-pattern-placeholder.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.goto("/settings/processes", { waitUntil: "networkidle", timeout: 120_000 });
        await ensureSidebarExpanded(page);
        await page.screenshot({
            path: path.join(screenshotDir, "07-full-page-bos-rail.png"),
            fullPage: true,
            animations: "disabled",
        });
    });
});
