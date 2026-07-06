import { config as loadEnv } from "dotenv";
import * as path from "path";
import { test, expect } from "@playwright/test";
import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

const SHOT_DIR = path.join(
    __dirname,
    "../../../docs/sprints/07_2026/workspace-header-surface-builder",
);

test.describe("Workspace Header Surface Builder", () => {
    test.describe.configure({ timeout: 240_000 });

    test("configure, publish twice, and render on /workspace", async ({ page }) => {
        await ensureAdminPlaywrightSession(page);

        await page.goto("/adminV2/settings/surfaces", { waitUntil: "domcontentloaded", timeout: 120_000 });
        await expect(page.getByTestId("surfaces-configuration-page")).toBeVisible({ timeout: 60_000 });

        await page.getByTestId("surfaces-category-item-workspaces").click();
        await expect(page.getByText("Workspace Header", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
        await page.getByText("Workspace Header", { exact: true }).first().click();

        await expect(page.getByTestId("workspace-header-builder")).toBeVisible({ timeout: 60_000 });
        await page.locator("[data-workspace-header-title-input]").fill("Firefly Early Learning");
        await page.locator("[data-workspace-header-subtitle-input]").fill("Operational Workspace");
        await page.locator("[data-workspace-header-kpi-label='1']").fill("Needs attention");
        await page.locator("[data-workspace-header-kpi-label='2']").fill("Overdue work");
        await page.locator("[data-workspace-header-kpi-label='3']").fill("Active leads");

        await page.screenshot({
            path: path.join(SHOT_DIR, "01-builder.png"),
            fullPage: true,
        });

        await page.getByTestId("workspace-header-publish").click();
        await expect(page.locator("[data-workspace-header-published]")).toBeVisible({ timeout: 30_000 });

        // Second publish: mark dirty then publish again (in-place upsert, no duplicate row).
        await page.locator("[data-workspace-header-subtitle-input]").fill("Operational Workspace.");
        await page.getByTestId("workspace-header-publish").click();
        await expect(page.locator("[data-workspace-header-published]")).toBeVisible({ timeout: 30_000 });
        await page.locator("[data-workspace-header-subtitle-input]").fill("Operational Workspace");
        await page.getByTestId("workspace-header-publish").click();
        await expect(page.locator("[data-workspace-header-published]")).toBeVisible({ timeout: 30_000 });
        await expect(page.locator("[data-workspace-header-title-input]")).toHaveValue("Firefly Early Learning");

        await page.goto("/workspace", { waitUntil: "domcontentloaded", timeout: 120_000 });
        await expect(page.locator('[data-runtime-label="WS.SURFACE"]')).toBeVisible({ timeout: 90_000 });
        await expect(page.locator("[data-workspace-header-title]")).toHaveText("Firefly Early Learning", {
            timeout: 60_000,
        });
        await expect(page.locator("[data-workspace-header-subtitle]")).toHaveText("Operational Workspace");
        await expect(page.locator("[data-workspace-header-kpi]")).toHaveCount(3);
        await expect(page.locator('[data-alloy-section="WS.HEADER_CALCULATIONS"]')).toBeVisible();

        await page.screenshot({
            path: path.join(SHOT_DIR, "02-runtime.png"),
            fullPage: true,
        });
    });
});
