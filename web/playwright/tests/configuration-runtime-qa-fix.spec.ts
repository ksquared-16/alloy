import * as fs from "fs";
import * as path from "path";
import { config as loadEnv } from "dotenv";
import { test, expect } from "@playwright/test";
import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

const screenshotDir = path.join(
    __dirname,
    "../../../docs/sprints/06_2026/configuration-runtime-qa-fix",
);

async function ensureSidebarExpanded(page: import("@playwright/test").Page) {
    const expand = page.getByRole("button", { name: "Expand sidebar" });
    if (await expand.isVisible().catch(() => false)) {
        await expand.click();
    }
}

test.beforeAll(() => {
    fs.mkdirSync(screenshotDir, { recursive: true });
});

test.describe("Configuration Runtime QA fix", () => {
    test("captures settings hub, rail icons, and tightened Processes workspace", async ({ page }) => {
        test.setTimeout(600_000);
        await page.setViewportSize({ width: 1440, height: 960 });
        await ensureAdminPlaywrightSession(page);

        await page.goto("/settings", { waitUntil: "networkidle", timeout: 120_000 });
        await expect(page.getByTestId("settings-configuration-hub")).toBeVisible({ timeout: 60_000 });
        await expect(page.getByTestId("settings-configuration-sections")).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "01-settings-hub-tiles.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.goto("/settings/processes", { waitUntil: "networkidle", timeout: 120_000 });
        await ensureSidebarExpanded(page);
        await expect(page.getByTestId("config-mode-nav-processes")).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "02-settings-rail-icons-home.png"),
            fullPage: true,
            animations: "disabled",
        });

        await expect(page.getByTestId("settings-processes-page")).toBeVisible({ timeout: 60_000 });
        await page.getByTestId("business-process-nav-stages").click();
        await expect(page.getByTestId("lifecycle-stage-workspace")).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "03-stages-workspace-clean.png"),
            fullPage: true,
            animations: "disabled",
        });

        const operatingPlanCard = page.getByTestId("configuration-runtime-card-operating_plan");
        const operatingPlanSummary = operatingPlanCard.locator(":scope > summary");
        if (!(await operatingPlanCard.getAttribute("open"))) {
            await operatingPlanSummary.click();
        }
        await page.screenshot({
            path: path.join(screenshotDir, "04-operating-plan-work-collapsed.png"),
            fullPage: true,
            animations: "disabled",
        });

        const workQueue = page.locator('[data-testid^="stage-operating-plan-work-queue-"]').first();
        if (await workQueue.isVisible().catch(() => false)) {
            await workQueue.click();
        }
        await page.screenshot({
            path: path.join(screenshotDir, "05-operating-plan-work-expanded.png"),
            fullPage: true,
            animations: "disabled",
        });

        const attentionSection = page.getByTestId("stage-operating-plan-attention-collapsible");
        if (await attentionSection.isVisible().catch(() => false)) {
            await attentionSection.locator("summary").click();
        }
        await page.screenshot({
            path: path.join(screenshotDir, "06-operating-plan-attention-collapsed.png"),
            fullPage: true,
            animations: "disabled",
        });

        const attentionQueue = page.locator('[data-testid^="stage-attention-rule-"]').first();
        if (await attentionQueue.isVisible().catch(() => false)) {
            await attentionQueue.click();
        }
        await page.screenshot({
            path: path.join(screenshotDir, "07-operating-plan-attention-expanded.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.getByTestId("business-process-nav-work-views").click();
        await expect(page.getByTestId("business-process-work-views-list-column")).toBeVisible({ timeout: 60_000 });
        const listButton = page.locator('[data-testid^="business-process-work-view-list-"]').first();
        if (await listButton.isVisible().catch(() => false)) {
            await listButton.click();
        }
        await page.screenshot({
            path: path.join(screenshotDir, "08-work-views-condensed-editor.png"),
            fullPage: true,
            animations: "disabled",
        });

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
            path: path.join(screenshotDir, "09-work-view-dynamic-date-controls.png"),
            fullPage: true,
            animations: "disabled",
        });

        await expect(page.locator('[data-testid$="-assignment-card"]').first()).toBeVisible({ timeout: 30_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "10-work-view-presentation-selectors.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.getByTestId("business-process-nav-actions").click();
        await expect(page.getByTestId("business-process-actions-list-column")).toBeVisible({ timeout: 60_000 });
        const actionList = page.locator('[data-testid^="business-process-action-list-"]').first();
        if (await actionList.isVisible().catch(() => false)) {
            await actionList.click();
        }
        await page.screenshot({
            path: path.join(screenshotDir, "11-actions-premium-workspace.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.screenshot({
            path: path.join(screenshotDir, "12-full-page-with-bos-rail.png"),
            fullPage: true,
            animations: "disabled",
        });
    });
});
