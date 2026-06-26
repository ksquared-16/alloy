import * as fs from "fs";
import * as path from "path";
import { config as loadEnv } from "dotenv";
import { test, expect } from "@playwright/test";
import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

const screenshotDir = path.join(
    __dirname,
    "../../../docs/sprints/06_2026/configuration-runtime-visual-parity",
);

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

test.describe("Configuration Runtime visual parity", () => {
    test("captures green/pine settings surfaces and typed filter controls", async ({ page }) => {
        test.setTimeout(600_000);
        await page.setViewportSize({ width: 1440, height: 960 });
        await ensureAdminPlaywrightSession(page);

        await page.goto("/settings", { waitUntil: "networkidle", timeout: 120_000 });
        await expect(page.getByTestId("settings-index-page")).toBeVisible({ timeout: 60_000 });
        await expect(page.getByTestId("settings-primary-tile-processes")).toBeVisible({ timeout: 30_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "01-settings-home.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.goto("/settings/processes", { waitUntil: "networkidle", timeout: 120_000 });
        await expect(page.getByTestId("settings-processes-page")).toBeVisible({ timeout: 60_000 });
        await selectEnrollmentProcess(page);
        await expect(page.getByTestId("business-process-workspace-nav")).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "02-process-overview.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.getByTestId("business-process-nav-work-views").click();
        await expect(page.getByTestId("business-process-work-views-workspace")).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "03-work-views-tab.png"),
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
        await expect(page.getByTestId("work-view-condition-date-preset").or(page.getByTestId("work-view-condition-value-0-preset"))).toBeVisible({ timeout: 30_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "04-work-view-date-options.png"),
            fullPage: true,
            animations: "disabled",
        });

        const statusField = page.getByTestId("work-view-condition-field-0");
        if (await statusField.isVisible().catch(() => false)) {
            await statusField.selectOption("status");
        }
        await expect(page.getByTestId("work-view-condition-value-status").or(page.getByTestId("work-view-condition-value-0"))).toBeVisible({ timeout: 30_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "05-work-view-status-options.png"),
            fullPage: true,
            animations: "disabled",
        });

        await expect(page.locator('[data-testid$="-assignment-card"]').first()).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "06-presentation-assignment.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.goto("/settings/processes", { waitUntil: "networkidle", timeout: 120_000 });
        await selectEnrollmentProcess(page);
        await page.getByTestId("business-process-nav-work-views").click();
        await expect(page.locator('[data-testid$="-assignment-card"]').first()).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "07-work-view-presentation-cards.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.goto("/settings/layouts", { waitUntil: "networkidle", timeout: 120_000 });
        await expect(page.getByTestId("layout-blueprint-lead-summary")).toBeVisible({ timeout: 60_000 });
        await page.getByTestId("layout-blueprint-lead-summary-open").click();
        await expect(page.getByTestId("lead-summary-blueprint-create")).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "08-layouts-lead-summary-editor.png"),
            fullPage: true,
            animations: "disabled",
        });
    });
});
