import * as path from "path";
import { config as loadEnv } from "dotenv";
import { test, expect } from "@playwright/test";
import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

const managedStorageState = process.env.PLAYWRIGHT_STORAGE_STATE?.trim();

test.use(managedStorageState ? { storageState: managedStorageState } : {});

async function ensureSidebarExpanded(page: import("@playwright/test").Page) {
    const expand = page.getByRole("button", { name: "Expand sidebar" });
    if (await expand.isVisible().catch(() => false)) {
        await expand.click();
    }
}

test.describe("configuration-runtime-organization-landing", () => {
    test("Organization Configuration landing and BOS", async ({ page }, testInfo) => {
        test.setTimeout(600_000);
        await page.setViewportSize({ width: 1920, height: 1080 });
        if (!managedStorageState) await ensureAdminPlaywrightSession(page);

        await page.goto("/organization", { waitUntil: "networkidle", timeout: 120_000 });
        await expect(page.getByTestId("organization-configuration-page")).toBeVisible({ timeout: 60_000 });
        await expect(page.getByTestId("organization-configuration-page")).toContainText("Organization Configuration");
        await expect(page.getByTestId("organization-configuration-domains")).toBeVisible();
        await page.screenshot({
            path: testInfo.outputPath("06-organization-configuration.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.goto("/settings/locations", { waitUntil: "networkidle", timeout: 120_000 });
        await expect(page.getByTestId("locations-configuration-page")).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: testInfo.outputPath("07-locations.png"),
            fullPage: true,
            animations: "disabled",
        });

        await ensureSidebarExpanded(page);
        await page.screenshot({
            path: testInfo.outputPath("08-full-bos.png"),
            fullPage: true,
            animations: "disabled",
        });
    });
});
