import * as fs from "fs";
import * as path from "path";
import { config as loadEnv } from "dotenv";
import { test, expect } from "@playwright/test";
import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

const screenshotDir = path.join(__dirname, "../../../docs/sprints/06_2026/configuration-runtime-locations");

async function ensureSidebarExpanded(page: import("@playwright/test").Page) {
    const expand = page.getByRole("button", { name: "Expand sidebar" });
    if (await expand.isVisible().catch(() => false)) {
        await expand.click();
    }
}

test.beforeAll(() => {
    fs.mkdirSync(screenshotDir, { recursive: true });
});

test.describe("configuration-runtime-locations", () => {
    test("Locations Configuration Mode surfaces", async ({ page }) => {
        test.setTimeout(600_000);
        await page.setViewportSize({ width: 1440, height: 960 });
        await ensureAdminPlaywrightSession(page);

        await page.goto("/settings/locations", { waitUntil: "networkidle", timeout: 120_000 });
        await expect(page.getByTestId("locations-configuration-page")).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "01-locations-section.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.getByTestId("locations-section-programs").click();
        await page.waitForTimeout(400);
        await page.screenshot({
            path: path.join(screenshotDir, "02-programs-section.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.getByTestId("locations-section-rooms").click();
        await page.waitForTimeout(400);
        await page.screenshot({
            path: path.join(screenshotDir, "03-rooms-section.png"),
            fullPage: true,
            animations: "disabled",
        });

        const firstItem = page.locator('[data-testid^="locations-item-"]').first();
        if (await firstItem.isVisible().catch(() => false)) {
            await firstItem.click();
            await page.waitForTimeout(400);
            await page.screenshot({
                path: path.join(screenshotDir, "04-workspace-detail.png"),
                fullPage: true,
                animations: "disabled",
            });
        }

        await ensureSidebarExpanded(page);
        await page.screenshot({
            path: path.join(screenshotDir, "05-full-bos.png"),
            fullPage: true,
            animations: "disabled",
        });

        await expect(page.getByTestId("locations-section-queue")).toBeVisible();
        await expect(page.getByTestId("locations-configuration-context")).toContainText("Locations");
    });
});
