import * as fs from "fs";
import * as path from "path";
import { config as loadEnv } from "dotenv";
import { test, expect } from "@playwright/test";
import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

const reviewDir = path.join(__dirname, "../../../docs/sprints/06_2026/configuration-runtime-phase-2a");

const screens: { path: string; filename: string; testId?: string }[] = [
    { path: "/settings", filename: "settings-hub.png", testId: "settings-index-page" },
    {
        path: "/settings/business-processes",
        filename: "business-processes.png",
        testId: "settings-business-processes-page",
    },
    { path: "/settings/layouts", filename: "layouts.png", testId: "layouts-gallery-shell" },
    { path: "/settings/fields", filename: "fields.png" },
    { path: "/settings/statuses", filename: "statuses.png" },
    { path: "/settings/analytics", filename: "analytics.png" },
    { path: "/settings/actions", filename: "actions.png" },
];

test.beforeAll(() => {
    fs.mkdirSync(reviewDir, { recursive: true });
});

test.describe("Configuration Runtime Phase 2A design review screenshots", () => {
    test("capture canonical /settings surfaces", async ({ page }) => {
        test.setTimeout(180_000);
        await page.setViewportSize({ width: 1440, height: 960 });
        await ensureAdminPlaywrightSession(page);

        for (const screen of screens) {
            await page.goto(screen.path, { waitUntil: "networkidle", timeout: 120_000 });
            if (screen.testId) {
                await expect(page.getByTestId(screen.testId)).toBeVisible({ timeout: 60_000 });
            }
            await page.screenshot({
                path: path.join(reviewDir, screen.filename),
                fullPage: true,
                animations: "disabled",
            });
        }
    });
});
