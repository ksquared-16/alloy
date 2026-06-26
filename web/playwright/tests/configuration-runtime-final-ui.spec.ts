import * as fs from "fs";
import * as path from "path";
import { config as loadEnv } from "dotenv";
import { test, expect } from "@playwright/test";
import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

const screenshotDir = path.join(
    __dirname,
    "../../../docs/sprints/06_2026/configuration-runtime-final-ui",
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

test.describe("Configuration Runtime final Processes UI", () => {
    test("captures two-column configuration layout with BOS rail", async ({ page }) => {
        test.setTimeout(600_000);
        await page.setViewportSize({ width: 1440, height: 960 });
        await ensureAdminPlaywrightSession(page);

        await page.goto("/settings/processes", { waitUntil: "networkidle", timeout: 120_000 });
        await expect(page.getByTestId("settings-processes-page")).toBeVisible({ timeout: 60_000 });
        await expect(page.getByTestId("lifecycle-process-catalog")).toBeVisible({ timeout: 60_000 });
        await selectEnrollmentProcess(page);
        await expect(page.getByTestId("business-process-configuration-shell")).toBeVisible({ timeout: 60_000 });
        await expect(page.locator('[data-adminv2-persistent-command-rail="true"]')).toBeVisible({ timeout: 30_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "01-processes-full-page-with-bos.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.getByTestId("business-process-nav-stages").click();
        await expect(page.getByTestId("business-process-stages-list-column")).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "02-stages-selected.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.getByTestId("business-process-nav-work-views").click();
        await expect(page.getByTestId("business-process-work-views-list-column")).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "03-work-views-selected.png"),
            fullPage: true,
            animations: "disabled",
        });

        const listButton = page.locator('[data-testid^="business-process-work-view-list-"]').first();
        if (await listButton.isVisible().catch(() => false)) {
            await listButton.click();
        }
        await expect(page.getByTestId("business-process-setup-workspace")).toBeVisible({ timeout: 30_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "04-work-view-editor.png"),
            fullPage: true,
            animations: "disabled",
        });

        const dateField = page.getByTestId("work-view-condition-field-0");
        if (await dateField.isVisible().catch(() => false)) {
            await dateField.selectOption("tour_date");
        }
        await expect(
            page.getByTestId("work-view-condition-date-preset").or(page.getByTestId("work-view-condition-value-0-preset")),
        ).toBeVisible({ timeout: 30_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "05-date-condition-options.png"),
            fullPage: true,
            animations: "disabled",
        });

        const datePreset = page
            .getByTestId("work-view-condition-date-preset")
            .or(page.getByTestId("work-view-condition-value-0-preset"));
        if (await datePreset.isVisible().catch(() => false)) {
            await datePreset.selectOption("__relative__");
        }
        await expect(
            page.getByTestId("work-view-condition-date-relative").or(
                page.getByTestId("work-view-condition-value-0-relative"),
            ),
        ).toBeVisible({ timeout: 30_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "06-relative-date-control.png"),
            fullPage: true,
            animations: "disabled",
        });

        if (await dateField.isVisible().catch(() => false)) {
            await dateField.selectOption("status");
        }
        await expect(
            page.getByTestId("work-view-condition-value-status").or(page.getByTestId("work-view-condition-value-0")),
        ).toBeVisible({ timeout: 30_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "07-status-condition-options.png"),
            fullPage: true,
            animations: "disabled",
        });

        await expect(page.locator('[data-testid$="-assignment-card"]').first()).toBeVisible({ timeout: 30_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "08-presentation-assignment-cards.png"),
            fullPage: true,
            animations: "disabled",
        });

        const previewLink = page.locator('[data-testid^="process-work-view-preview-"]').first();
        if (await previewLink.isVisible().catch(() => false)) {
            await previewLink.click();
            await page.waitForURL(/\/workspace\/dept\/.+\/work-unit\/.+/, { timeout: 120_000 });
            await page.screenshot({
                path: path.join(screenshotDir, "09-preview-runtime.png"),
                fullPage: true,
                animations: "disabled",
            });
        }
    });
});
