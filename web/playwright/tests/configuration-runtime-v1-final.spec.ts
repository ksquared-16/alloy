import * as fs from "fs";
import * as path from "path";
import { config as loadEnv } from "dotenv";
import { test, expect } from "@playwright/test";
import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

const screenshotDir = path.join(__dirname, "../../../docs/sprints/06_2026/configuration-runtime-v1-final");

async function ensureSidebarExpanded(page: import("@playwright/test").Page) {
    const expand = page.getByRole("button", { name: "Expand sidebar" });
    if (await expand.isVisible().catch(() => false)) {
        await expand.click();
    }
}

test.beforeAll(() => {
    fs.mkdirSync(screenshotDir, { recursive: true });
});

test.describe("configuration-runtime-v1-final", () => {
    test("Configuration Runtime V1 surfaces", async ({ page }) => {
        test.setTimeout(600_000);
        await page.setViewportSize({ width: 1920, height: 1080 });
        await ensureAdminPlaywrightSession(page);

        const shots: { path: string; file: string; testId?: string }[] = [
            { path: "/settings", file: "01-settings-index.png", testId: "settings-configuration-context" },
            { path: "/settings/processes", file: "02-processes.png", testId: "business-process-configuration-shell" },
            { path: "/settings/fields", file: "03-fields.png", testId: "fields-configuration-page" },
            { path: "/settings/statuses", file: "04-statuses.png", testId: "statuses-configuration-page" },
            { path: "/settings/users-roles", file: "05-access.png", testId: "users-roles-configuration-context" },
            { path: "/settings/communications", file: "06-communications.png", testId: "communications-configuration-page" },
            { path: "/settings/locations", file: "07-locations.png", testId: "locations-configuration-page" },
        ];

        for (const shot of shots) {
            await page.goto(shot.path, { waitUntil: "networkidle", timeout: 120_000 });
            if (shot.testId) {
                await expect(page.getByTestId(shot.testId)).toBeVisible({ timeout: 60_000 });
            }
            await page.waitForTimeout(400);
            await page.screenshot({
                path: path.join(screenshotDir, shot.file),
                fullPage: true,
                animations: "disabled",
            });
        }

        await page.goto("/settings/locations", { waitUntil: "networkidle", timeout: 120_000 });
        await ensureSidebarExpanded(page);
        await page.screenshot({
            path: path.join(screenshotDir, "08-full-bos.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.goto("/settings", { waitUntil: "networkidle", timeout: 120_000 });
        await expect(page.getByTestId("settings-configuration-context")).toContainText("Settings");
        await expect(page.getByTestId("settings-configuration-context")).toContainText("Platform Configuration");
        await expect(page.getByTestId("settings-configuration-hero")).toHaveCount(0);
    });
});
