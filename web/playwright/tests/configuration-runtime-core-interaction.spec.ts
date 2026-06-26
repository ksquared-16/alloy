import * as fs from "fs";
import * as path from "path";
import { config as loadEnv } from "dotenv";
import { test, expect } from "@playwright/test";
import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

const screenshotDir = path.join(
    __dirname,
    "../../../docs/sprints/06_2026/configuration-runtime-core-interaction",
);

async function ensureSidebarExpanded(page: import("@playwright/test").Page) {
    const expand = page.getByRole("button", { name: "Expand sidebar" });
    if (await expand.isVisible().catch(() => false)) {
        await expand.click();
    }
}

async function openProcesses(page: import("@playwright/test").Page) {
    await page.goto("/settings/processes", { waitUntil: "networkidle", timeout: 120_000 });
    await expect(page.getByTestId("settings-processes-page")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("business-process-configuration-shell")).toBeVisible({ timeout: 60_000 });
}

test.beforeAll(() => {
    fs.mkdirSync(screenshotDir, { recursive: true });
});

test.describe("Configuration Runtime core interaction", () => {
    test("captures Configuration Mode navigation and queue workspaces", async ({ page }) => {
        test.setTimeout(600_000);
        await page.setViewportSize({ width: 1440, height: 960 });
        await ensureAdminPlaywrightSession(page);

        await page.goto("/settings/processes", { waitUntil: "networkidle", timeout: 120_000 });
        await ensureSidebarExpanded(page);
        await expect(page.getByTestId("config-mode-nav-processes")).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "01-settings-mode-nav.png"),
            fullPage: true,
            animations: "disabled",
        });

        await expect(page.getByTestId("settings-processes-page")).toBeVisible({ timeout: 60_000 });
        await expect(page.getByTestId("business-process-configuration-shell")).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "02-processes-context.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.getByTestId("business-process-nav-stages").click();
        await expect(page.getByTestId("business-process-stages-list-column")).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "03-stages-queue-workspace.png"),
            fullPage: true,
            animations: "disabled",
        });

        const operatingPlanCard = page.getByTestId("configuration-runtime-card-operating_plan");
        const operatingPlanSummary = operatingPlanCard.locator(":scope > summary");
        if (await operatingPlanSummary.isVisible().catch(() => false)) {
            await operatingPlanSummary.click();
        }
        const workQueue = page.locator('[data-testid^="stage-operating-plan-work-queue-"]').first();
        if (await workQueue.isVisible().catch(() => false)) {
            await workQueue.click();
        }
        await page.screenshot({
            path: path.join(screenshotDir, "04-stage-operating-plan-work-item.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.getByTestId("business-process-nav-work-views").click();
        await expect(page.getByTestId("business-process-work-views-list-column")).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "05-work-views-queue-workspace.png"),
            fullPage: true,
            animations: "disabled",
        });

        const listButton = page.locator('[data-testid^="business-process-work-view-list-"]').first();
        if (await listButton.isVisible().catch(() => false)) {
            await listButton.click();
        }
        const dateField = page.getByTestId("work-view-condition-field-0");
        if (await dateField.isVisible().catch(() => false)) {
            await dateField.selectOption("tour_date");
        }
        const datePreset = page
            .getByTestId("work-view-condition-date-preset")
            .or(page.getByTestId("work-view-condition-value-0-preset"));
        if (await datePreset.isVisible().catch(() => false)) {
            await datePreset.selectOption("__relative__");
        }
        await page.screenshot({
            path: path.join(screenshotDir, "06-work-view-dynamic-date.png"),
            fullPage: true,
            animations: "disabled",
        });

        await expect(page.locator('[data-testid$="-assignment-card"]').first()).toBeVisible({ timeout: 30_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "07-work-view-presentation.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.getByTestId("business-process-nav-actions").click();
        await expect(page.getByTestId("business-process-actions-list-column")).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "08-actions-queue-workspace.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.getByTestId("business-process-nav-health").click();
        await expect(page.getByTestId("business-process-health-list-column")).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "09-health-queue-workspace.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.screenshot({
            path: path.join(screenshotDir, "10-full-page-with-bos.png"),
            fullPage: true,
            animations: "disabled",
        });
    });
});
