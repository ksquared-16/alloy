import * as fs from "fs";
import * as path from "path";
import { config as loadEnv } from "dotenv";
import { test, expect } from "@playwright/test";
import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

const screenshotDir = path.join(__dirname, "../../../docs/sprints/archive/06_2026/configuration-runtime-v1-final");

async function ensureSidebarExpanded(page: import("@playwright/test").Page) {
    const expand = page.getByRole("button", { name: "Expand sidebar" });
    if (await expand.isVisible().catch(() => false)) {
        await expand.click();
    }
}

test.beforeAll(() => {
    fs.mkdirSync(screenshotDir, { recursive: true });
});

test.describe("configuration-runtime-settings-landing", () => {
    test("compact Settings index and BOS", async ({ page }) => {
        test.setTimeout(600_000);
        await page.setViewportSize({ width: 1920, height: 1080 });
        await ensureAdminPlaywrightSession(page);

        await page.goto("/settings", { waitUntil: "networkidle", timeout: 120_000 });
        await expect(page.getByTestId("settings-configuration-context")).toBeVisible({ timeout: 60_000 });
        await expect(page.getByTestId("settings-configuration-context")).toContainText("Platform Configuration");
        await expect(page.getByTestId("settings-configuration-context")).toContainText(
            "Configure Alloy across your organization, data model, operational workflows, and business modules.",
        );
        await expect(page.getByTestId("settings-configuration-hero")).toHaveCount(0);
        await expect(page.getByTestId("settings-configuration-sections")).toBeVisible();
        await page.screenshot({
            path: path.join(screenshotDir, "06-settings-index-compact.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.goto("/settings/locations", { waitUntil: "networkidle", timeout: 120_000 });
        await expect(page.getByTestId("locations-configuration-page")).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "07-locations.png"),
            fullPage: true,
            animations: "disabled",
        });

        await ensureSidebarExpanded(page);
        await page.screenshot({
            path: path.join(screenshotDir, "08-full-bos.png"),
            fullPage: true,
            animations: "disabled",
        });
    });
});
