import * as fs from "fs";
import * as path from "path";
import { config as loadEnv } from "dotenv";
import { test, expect } from "@playwright/test";
import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

const screenshotDir = path.join(
    __dirname,
    "../../../docs/sprints/archive/06_2026/workspace-v3-operational-command-center/mockups/final-validation",
);

test.beforeAll(() => {
    fs.mkdirSync(screenshotDir, { recursive: true });
});

test.describe("Enrollment Operational Surface — implementation capture", () => {
    test("captures workspace with enrollment operational surface and work line hover", async ({ page }) => {
        test.setTimeout(600_000);
        await page.setViewportSize({ width: 1440, height: 960 });
        await ensureAdminPlaywrightSession(page);

        await page.goto("/workspace", { waitUntil: "domcontentloaded", timeout: 120_000 });
        await expect(
            page
                .locator(
                    '[data-operational-surface-tile="enrollment"], [data-ws-business-process-grid]',
                )
                .first(),
        ).toBeVisible({ timeout: 120_000 });

        await page.waitForTimeout(2500);

        await page.screenshot({
            path: path.join(screenshotDir, "03-workspace-enrollment-operational-surface-live.png"),
            fullPage: true,
            animations: "disabled",
        });

        const workLine = page.locator('[data-operational-surface-work-line="tours"]').first();
        if (await workLine.isVisible().catch(() => false)) {
            await workLine.hover();
            await page.waitForTimeout(400);
            await page.screenshot({
                path: path.join(
                    screenshotDir,
                    "04-workspace-enrollment-work-line-hover-live.png",
                ),
                fullPage: false,
                animations: "disabled",
            });

            const href = await workLine.getAttribute("href");
            if (href) {
                await page.goto(href, { waitUntil: "domcontentloaded", timeout: 120_000 });
                await page.waitForTimeout(3000);
                await page.screenshot({
                    path: path.join(
                        screenshotDir,
                        "05-workspace-enrollment-work-view-deeplink-live.png",
                    ),
                    fullPage: true,
                    animations: "disabled",
                });
                expect(page.url()).toContain("work_view=");
            }
        }
    });
});
