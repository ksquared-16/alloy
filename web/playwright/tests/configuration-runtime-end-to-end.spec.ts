import * as fs from "fs";
import * as path from "path";
import { config as loadEnv } from "dotenv";
import { test, expect } from "@playwright/test";
import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

const screenshotDir = path.join(
    __dirname,
    "../../../docs/sprints/archive/06_2026/configuration-runtime-end-to-end",
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

test.describe("Configuration Runtime end-to-end vertical slice", () => {
    test("settings → processes → work views → layouts → preview runtime", async ({ page }) => {
        test.setTimeout(600_000);
        await page.setViewportSize({ width: 1440, height: 960 });
        await ensureAdminPlaywrightSession(page);

        await page.goto("/settings", { waitUntil: "networkidle", timeout: 120_000 });
        await expect(page.getByTestId("settings-index-page")).toBeVisible({ timeout: 60_000 });
        await expect(page.getByRole("link", { name: "Processes" }).first()).toBeVisible({ timeout: 30_000 });
        await expect(page.getByRole("link", { name: "Layouts" }).first()).toBeVisible({ timeout: 30_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "01-settings-home.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.goto("/settings/business-processes", { waitUntil: "networkidle", timeout: 120_000 });
        await expect(page).toHaveURL(/\/settings\/processes/, { timeout: 30_000 });
        await expect(page.getByTestId("settings-processes-page")).toBeVisible({ timeout: 60_000 });
        await expect(page.getByRole("heading", { name: "Processes" })).toBeVisible({ timeout: 30_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "02-processes-home.png"),
            fullPage: true,
            animations: "disabled",
        });

        await selectEnrollmentProcess(page);
        await expect(page.getByTestId("business-process-workspace-nav")).toBeVisible({ timeout: 60_000 });
        await page.getByTestId("business-process-nav-work-views").click();
        await expect(page.getByTestId("business-process-work-views-workspace")).toBeVisible({ timeout: 60_000 });

        const listButton = page.locator('[data-testid^="business-process-work-view-list-"]').first();
        if (await listButton.isVisible().catch(() => false)) {
            await listButton.click();
        }
        await page.screenshot({
            path: path.join(screenshotDir, "03-work-views-editor.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.getByTestId("work-view-add-condition").click();
        await page.screenshot({
            path: path.join(screenshotDir, "04-work-view-conditions.png"),
            fullPage: true,
            animations: "disabled",
        });

        await expect(page.locator('[data-testid$="-assignment-card"]').first()).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "05-layout-assignment.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.goto("/settings/layouts", { waitUntil: "networkidle", timeout: 120_000 });
        await expect(page.getByTestId("layout-blueprint-lead-summary")).toBeVisible({ timeout: 60_000 });
        await page.getByTestId("layout-blueprint-lead-summary-open").click();
        await expect(page.getByTestId("lead-summary-blueprint-create")).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "06-layouts-lead-summary-editor.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.goto("/settings/processes", { waitUntil: "networkidle", timeout: 120_000 });
        await selectEnrollmentProcess(page);
        await page.getByTestId("business-process-nav-work-views").click();
        await expect(page.getByTestId("business-process-work-views-workspace")).toBeVisible({ timeout: 60_000 });

        const previewLink = page.locator('[data-testid^="process-work-view-preview-"]').first();
        await expect(previewLink).toBeVisible({ timeout: 60_000 });
        await previewLink.click();
        await page.waitForURL(/\/workspace\/dept\/.+\/work-unit\/.+/, { timeout: 120_000 });
        await expect(page.url()).toMatch(/work_view=/);
        await page.screenshot({
            path: path.join(screenshotDir, "07-preview-runtime.png"),
            fullPage: true,
            animations: "disabled",
        });

        await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible({ timeout: 60_000 });
        await page.waitForTimeout(8_000);
        const perspectiveRail = page.locator(
            '[data-alloy-os-context-perspective-rail], [data-ws-command-pills], .adminv2-ws-queue-pill-scroll',
        );
        if (await perspectiveRail.first().isVisible().catch(() => false)) {
            await perspectiveRail.first().scrollIntoViewIfNeeded();
        }
        await page.screenshot({
            path: path.join(screenshotDir, "08-runtime-active-work-view.png"),
            fullPage: true,
            animations: "disabled",
        });
    });
});
