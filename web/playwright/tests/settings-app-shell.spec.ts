import * as fs from "fs";
import * as path from "path";
import { config as loadEnv } from "dotenv";
import { test, expect } from "@playwright/test";
import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

const screenshotDir = path.join(
    __dirname,
    "../../../docs/sprints/archive/06_2026/configuration-runtime-phase-3a",
);

async function expectAuthenticatedAdminShell(page: import("@playwright/test").Page) {
    await expect(page.locator(".marketing-site-chrome")).toHaveCount(0);
    await expect(page.locator('[data-adminv2-app-shell="workspace-v2"]')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
}

test.beforeAll(() => {
    fs.mkdirSync(screenshotDir, { recursive: true });
});

test.describe("Settings authenticated app shell", () => {
    test("unauthenticated /settings redirects to login", async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto("/settings", { waitUntil: "networkidle", timeout: 60_000 });
        await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
        await context.close();
    });

    test("unauthenticated /settings/business-processes redirects to login", async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto("/settings/business-processes", { waitUntil: "networkidle", timeout: 60_000 });
        await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
        await context.close();
    });

    test("authenticated /settings routes render AdminV2 shell without marketing chrome", async ({ page }) => {
        test.setTimeout(240_000);
        await page.setViewportSize({ width: 1440, height: 960 });
        await ensureAdminPlaywrightSession(page);

        const routes = [
            { path: "/settings", screenshot: "settings-app-shell-home.png" },
            { path: "/settings/business-processes", screenshot: "settings-app-shell-business-processes.png" },
            { path: "/settings/layouts", screenshot: "settings-app-shell-layouts.png" },
        ] as const;

        for (const route of routes) {
            await page.goto(route.path, { waitUntil: "networkidle", timeout: 120_000 });
            await expectAuthenticatedAdminShell(page);
            await page.screenshot({
                path: path.join(screenshotDir, route.screenshot),
                fullPage: true,
                animations: "disabled",
            });
        }
    });

    test("/admin/settings/business-processes redirects to protected /settings/business-processes", async ({
        browser,
    }) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto("/admin/settings/business-processes", { waitUntil: "networkidle", timeout: 60_000 });
        await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
        await context.close();
    });

    test("authenticated /admin/settings/business-processes lands on canonical settings route in AdminV2 shell", async ({
        page,
    }) => {
        test.setTimeout(180_000);
        await page.setViewportSize({ width: 1440, height: 960 });
        await ensureAdminPlaywrightSession(page);

        await page.goto("/admin/settings/business-processes", { waitUntil: "networkidle", timeout: 120_000 });
        await expect(page).toHaveURL(/\/settings\/business-processes/, { timeout: 30_000 });
        await expectAuthenticatedAdminShell(page);
        await expect(page.getByTestId("settings-business-processes-page")).toBeVisible({ timeout: 60_000 });
    });
});
