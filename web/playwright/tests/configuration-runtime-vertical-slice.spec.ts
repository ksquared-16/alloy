import * as fs from "fs";
import * as path from "path";
import { config as loadEnv } from "dotenv";
import { test, expect } from "@playwright/test";
import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

const screenshotDir = path.join(
    __dirname,
    "../../../docs/sprints/archive/06_2026/configuration-runtime-vertical-slice",
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

test.describe("Configuration Runtime vertical slice", () => {
    test("captures Processes → Work Views → Presentation → Layouts → preview flow", async ({ page }) => {
        test.setTimeout(360_000);
        await page.setViewportSize({ width: 1440, height: 960 });
        await ensureAdminPlaywrightSession(page);

        await page.goto("/settings/processes", { waitUntil: "networkidle", timeout: 120_000 });
        await expect(page.getByTestId("settings-processes-page")).toBeVisible({ timeout: 60_000 });
        await expect(page.getByRole("heading", { name: "Processes" })).toBeVisible({ timeout: 30_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "01-processes-hub.png"),
            fullPage: true,
            animations: "disabled",
        });

        await selectEnrollmentProcess(page);
        await expect(page.getByTestId("business-process-workspace-nav")).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "02-process-selected.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.getByTestId("business-process-nav-work-views").click();
        await expect(page.getByTestId("business-process-work-views-workspace")).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "03-work-views-section.png"),
            fullPage: true,
            animations: "disabled",
        });

        const listButton = page.locator('[data-testid^="business-process-work-view-list-"]').first();
        if (await listButton.isVisible().catch(() => false)) {
            await listButton.click();
        }
        await page.getByTestId("work-view-add-condition").click();
        await page.screenshot({
            path: path.join(screenshotDir, "04-work-view-editor.png"),
            fullPage: true,
            animations: "disabled",
        });

        await expect(page.locator('[data-testid$="-assignment-card"]').first()).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "05-presentation-assignment.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.goto("/settings/layouts", { waitUntil: "networkidle", timeout: 120_000 });
        await expect(page.getByTestId("layout-blueprint-lead-summary")).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "06-layouts-blueprint-library.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.getByTestId("layout-blueprint-lead-summary-open").click();
        await expect(page.getByTestId("lead-summary-blueprint-create")).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "07-lead-summary-card-editor.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.goto("/settings/processes", { waitUntil: "networkidle", timeout: 120_000 });
        await selectEnrollmentProcess(page);
        await page.getByTestId("business-process-nav-work-views").click();
        await expect(page.getByTestId("business-process-work-views-workspace")).toBeVisible({ timeout: 60_000 });

        const previewLink = page.locator('[data-testid^="process-work-view-preview-"]').first();
        if (await previewLink.isVisible().catch(() => false)) {
            await previewLink.click();
            await page.waitForURL(/\/workspace\/dept\/.+\/work-unit\/.+/, { timeout: 120_000 });
            await page.screenshot({
                path: path.join(screenshotDir, "08-runtime-preview.png"),
                fullPage: true,
                animations: "disabled",
            });
        }
    });
});
