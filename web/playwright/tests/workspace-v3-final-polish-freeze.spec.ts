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

test.describe("Workspace V3 final polish — freeze capture", () => {
    test("captures compact pulse bands, enrollment surface, sidebar, and deep links", async ({ page }) => {
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

        const orgPulse = page.locator('[data-workspace-org-pulse-band="true"]');
        if (await orgPulse.isVisible().catch(() => false)) {
            await expect(page.locator('[data-workspace-command-center-label="true"]')).toHaveText(
                "Command Center",
            );
            await expect(page.locator('[data-workspace-operational-pulse-strip="true"]')).toBeVisible();
        }

        await expect(page.locator('[data-ws-layout="workspace-section-b"]')).toBeVisible();

        await expect(
            page.locator('[data-ws-layout="workspace-section-b"] h2:not(.sr-only)'),
        ).toHaveCount(0);

        await page.waitForTimeout(2500);

        await page.screenshot({
            path: path.join(screenshotDir, "06-workspace-v3-final-polish.png"),
            fullPage: true,
            animations: "disabled",
        });

        const enrollmentTile = page.locator('[data-operational-surface-tile="enrollment"]').first();
        if (await enrollmentTile.isVisible().catch(() => false)) {
            await enrollmentTile.hover();
            await page.waitForTimeout(400);
            await page.screenshot({
                path: path.join(screenshotDir, "07-workspace-enrollment-tile-hover-final.png"),
                fullPage: false,
                animations: "disabled",
            });
        }

        const workLine = page.locator('[data-operational-surface-work-line="tours"]').first();
        if (await workLine.isVisible().catch(() => false)) {
            const href = await workLine.getAttribute("href");
            if (href) {
                await page.goto(href, { waitUntil: "domcontentloaded", timeout: 120_000 });
                await page.waitForTimeout(3000);
                await page.screenshot({
                    path: path.join(
                        screenshotDir,
                        "08-workspace-enrollment-work-view-deeplink-final.png",
                    ),
                    fullPage: true,
                    animations: "disabled",
                });
                expect(page.url()).toContain("work_view=");
            }
        }

        await page.goto("/workspace", { waitUntil: "domcontentloaded", timeout: 120_000 });
        await page.waitForTimeout(1500);

        const sidebar = page.locator('[data-adminv2-sidebar="true"]');
        await expect(sidebar).toBeVisible();
        await expect(sidebar.locator(".adminv2-sidebar-section-label")).toHaveCount(0);
        await expect(sidebar.getByText("Work View", { exact: true })).toHaveCount(0);
        await expect(sidebar.locator('[data-adminv2-sidebar-modal-nav="processing"]')).toBeVisible();

        await sidebar.screenshot({
            path: path.join(screenshotDir, "09-workspace-sidebar-final.png"),
            animations: "disabled",
        });
    });
});
