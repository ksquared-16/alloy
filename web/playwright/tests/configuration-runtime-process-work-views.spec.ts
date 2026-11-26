import * as fs from "fs";
import * as path from "path";
import { config as loadEnv } from "dotenv";
import { test, expect } from "@playwright/test";
import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

const screenshotDir = path.join(
    __dirname,
    "../../../docs/sprints/archive/06_2026/configuration-runtime-process-work-views",
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

test.describe("Process-level Work Views realignment", () => {
    test("shows process navigation and Work Views workspace", async ({ page }) => {
        test.setTimeout(300_000);
        await page.setViewportSize({ width: 1440, height: 960 });
        await ensureAdminPlaywrightSession(page);

        await page.goto("/settings/processes", { waitUntil: "networkidle", timeout: 120_000 });
        await selectEnrollmentProcess(page);

        await expect(page.getByTestId("business-process-workspace-nav")).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "process-level-nav.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.getByTestId("business-process-nav-work-views").click();
        await expect(page.getByTestId("business-process-work-views-workspace")).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "work-views-workspace.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.getByTestId("work-view-add-condition").click();
        await page.screenshot({
            path: path.join(screenshotDir, "work-view-condition-editor.png"),
            animations: "disabled",
        });

        await page.getByTestId("business-process-nav-stages").click();
        await expect(page.getByTestId("lifecycle-stage-workspace")).toBeVisible({ timeout: 60_000 });
        await expect(page.getByTestId("configuration-runtime-card-work-views")).toHaveCount(0);
        await page.screenshot({
            path: path.join(screenshotDir, "stage-workspace-no-work-views.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.screenshot({
            path: path.join(screenshotDir, "full-page-bos-rail.png"),
            fullPage: true,
            animations: "disabled",
        });
    });
});
