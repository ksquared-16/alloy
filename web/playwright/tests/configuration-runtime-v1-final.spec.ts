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

test.describe("configuration-runtime-v1-final", () => {
    test("Configuration Runtime V1 surfaces", async ({ page }, testInfo) => {
        test.setTimeout(600_000);
        await page.setViewportSize({ width: 1920, height: 1080 });
        if (!managedStorageState) await ensureAdminPlaywrightSession(page);

        const shots: { path: string; file: string; testId?: string }[] = [
            { path: "/organization", file: "01-organization.png", testId: "organization-configuration-page" },
            { path: "/settings/processes", file: "02-processes.png", testId: "business-process-configuration-shell" },
            { path: "/settings/fields", file: "03-fields.png", testId: "fields-configuration-page" },
            { path: "/settings/statuses", file: "04-statuses.png", testId: "statuses-configuration-page" },
            { path: "/settings/users-roles", file: "05-access.png", testId: "users-roles-configuration-context" },
            { path: "/organization/communications", file: "06-communications.png", testId: "organization-communications-page" },
            { path: "/settings/locations", file: "07-locations.png", testId: "locations-configuration-page" },
        ];

        for (const shot of shots) {
            await page.goto(shot.path, { waitUntil: "networkidle", timeout: 120_000 });
            if (shot.testId) {
                await expect(page.getByTestId(shot.testId)).toBeVisible({ timeout: 60_000 });
            }
            await page.waitForTimeout(400);
            await page.screenshot({
                path: testInfo.outputPath(shot.file),
                fullPage: true,
                animations: "disabled",
            });
        }

        await page.goto("/settings/locations", { waitUntil: "networkidle", timeout: 120_000 });
        await ensureSidebarExpanded(page);
        await page.screenshot({
            path: testInfo.outputPath("08-full-bos.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.goto("/organization", { waitUntil: "networkidle", timeout: 120_000 });
        await expect(page.getByTestId("organization-configuration-page")).toContainText("Organization Configuration");
        await expect(page.getByTestId("settings-configuration-context")).toHaveCount(0);
    });
});
