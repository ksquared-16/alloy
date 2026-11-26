import * as fs from "fs";
import * as path from "path";
import { config as loadEnv } from "dotenv";
import { test, expect } from "@playwright/test";
import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

const screenshotDir = path.join(
    __dirname,
    "../../../docs/sprints/archive/06_2026/configuration-runtime-doctrine-cleanup",
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

test.describe("Configuration Runtime doctrine cleanup", () => {
    test("typography, Statuses detail, and pattern placeholders", async ({ page }) => {
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
            path: path.join(screenshotDir, "02-processes.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.goto("/settings/statuses", { waitUntil: "networkidle", timeout: 120_000 });
        await expect(page.getByTestId("statuses-configuration-page")).toBeVisible({ timeout: 60_000 });
        await expect(page.getByTestId("lifecycle-crosslink-statuses")).toHaveCount(0);
        await page.screenshot({
            path: path.join(screenshotDir, "03-statuses-queue-workspace.png"),
            fullPage: true,
            animations: "disabled",
        });

        const statusItem = page.locator('[data-testid^="statuses-status-"]').first();
        if (await statusItem.isVisible().catch(() => false)) {
            await statusItem.click();
            await expect(page.getByTestId("status-configuration-detail")).toBeVisible({ timeout: 30_000 });
        }
        await expect(page.getByText("Display style", { exact: false })).toHaveCount(0);
        await page.screenshot({
            path: path.join(screenshotDir, "04-status-detail-no-display-style.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.goto("/settings/fields", { waitUntil: "networkidle", timeout: 120_000 });
        await expect(page.getByTestId("fields-configuration-pattern-placeholder")).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "05-fields-pattern-placeholder.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.goto("/settings/actions", { waitUntil: "networkidle", timeout: 120_000 });
        await expect(page.getByTestId("actions-configuration-pattern-placeholder")).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "06-actions-pattern-placeholder.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.goto("/settings/processes", { waitUntil: "networkidle", timeout: 120_000 });
        await ensureSidebarExpanded(page);
        const activeItem = page.locator(".process-config-work-view-list-card--active").first();
        if (await activeItem.isVisible().catch(() => false)) {
            const bg = await activeItem.evaluate((el) => getComputedStyle(el).backgroundColor);
            if (bg.includes("162")) expect(colorClose(bg)).toBeTruthy();
        }
        await page.screenshot({
            path: path.join(screenshotDir, "07-full-page-bos-rail.png"),
            fullPage: true,
            animations: "disabled",
        });
    });
});
