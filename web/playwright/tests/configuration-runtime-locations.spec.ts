import * as fs from "fs";
import * as path from "path";
import { config as loadEnv } from "dotenv";
import { test, expect } from "@playwright/test";
import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

const screenshotDir = path.join(__dirname, "../../../docs/sprints/completed/locations-product-review-remediation");

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

        await page.goto("/settings/locations", {
            waitUntil: "networkidle",
            timeout: 120_000,
        });
        await expect(page.getByTestId("locations-configuration-page")).toBeVisible({
            timeout: 60_000,
        });
        await expect(page.getByTestId("locations-fleet-landing")).toBeVisible({
            timeout: 60_000,
        });
        await page.screenshot({
            path: path.join(screenshotDir, "00-locations-fleet-landing.png"),
            fullPage: true,
            animations: "disabled",
        });

        const firstFleetRow = page.locator('[data-testid^="locations-fleet-row-"]').first();
        await expect(firstFleetRow).toBeVisible({ timeout: 30_000 });
        await firstFleetRow.click();
        await expect(page.getByTestId("locations-selected-location")).toBeVisible({
            timeout: 60_000,
        });
        await page.screenshot({
            path: path.join(screenshotDir, "01-location-overview.png"),
            fullPage: true,
            animations: "disabled",
        });

        const editLocation = page.getByTestId("locations-rail-edit-details");
        if (await editLocation.isVisible().catch(() => false)) {
            await editLocation.click();
            const timezone = page.getByTestId("locations-site-timezone");
            await expect(timezone).toBeVisible();
            await expect(timezone.locator("option")).toHaveCount(8);
            await expect(timezone.locator("option")).toHaveText([
                "Select a U.S. time zone",
                "Eastern Time",
                "Central Time",
                "Mountain Time",
                "Arizona",
                "Pacific Time",
                "Alaska Time",
                "Hawaii Time",
            ]);
            expect(await timezone.locator("option").evaluateAll((options) => options.map((option) => option.getAttribute("value")))).toEqual([
                "",
                "America/New_York",
                "America/Chicago",
                "America/Denver",
                "America/Phoenix",
                "America/Los_Angeles",
                "America/Anchorage",
                "Pacific/Honolulu",
            ]);
            await page.getByRole("button", { name: /^← Back to/ }).click();
        }

        await page.getByTestId("locations-tab-programs").click();
        await page.waitForTimeout(400);
        await page.screenshot({
            path: path.join(screenshotDir, "02-programs.png"),
            fullPage: true,
            animations: "disabled",
        });
        await expect(page.locator('[data-testid^="locations-program-summary-"]').first()).toBeVisible();
        await expect(page.getByTestId("locations-program-ops")).toBeVisible();
        await expect(page.getByTestId("locations-programs")).not.toContainText("Relationships");

        await page.getByTestId("locations-tab-rooms").click();
        await page.waitForTimeout(400);
        await page.screenshot({
            path: path.join(screenshotDir, "03-rooms.png"),
            fullPage: true,
            animations: "disabled",
        });

        const firstItem = page.locator('[data-testid^="locations-room-"]').first();
        if (await firstItem.isVisible().catch(() => false)) {
            await firstItem.click();
            await page.getByTestId("locations-room-toggle-edit").click();
            await expect(page.getByTestId("locations-room-capacity")).toBeVisible();
            await expect(page.getByTestId("locations-room-save")).toBeVisible();
            await page.waitForTimeout(400);
            await page.screenshot({
                path: path.join(screenshotDir, "04-workspace-detail.png"),
                fullPage: true,
                animations: "disabled",
            });
        }

        await page.getByTestId("locations-tab-schedule").click();
        await expect(page.getByTestId("locations-schedule-patterns")).toBeVisible();
        await expect(page.getByTestId("locations-schedule-closures")).toBeVisible();
        await expect(page.getByTestId("locations-schedule-add")).toBeVisible();
        await page.getByTestId("locations-schedule-add").click();
        await expect(page.getByTestId("locations-schedule-create")).toBeVisible();
        await expect(page.getByTestId("locations-schedule-create-active")).toBeChecked();
        await expect(
            page.getByTestId("locations-schedule-create-weekdays").getByRole("button", { name: "Mon" }),
        ).toHaveAttribute("aria-pressed", "true");
        await page.getByRole("button", { name: "Cancel" }).last().click();
        const railScheduleAction = page.getByTestId("locations-rail-add-schedule-pattern");
        if (!(await railScheduleAction.isVisible().catch(() => false))) {
            await page.getByRole("button", { name: /^Actions \(/ }).click();
        }
        await expect(railScheduleAction).toBeVisible();
        await railScheduleAction.click();
        await expect(page.getByTestId("locations-schedule-create")).toBeVisible();
        await page.getByRole("button", { name: "Cancel" }).last().click();
        await page.screenshot({
            path: path.join(screenshotDir, "05-schedule.png"),
            fullPage: true,
            animations: "disabled",
        });

        for (const [tab, filename, surface] of [
            ["tours", "06-tours.png", "locations-tours-surface"],
            ["placement", "07-placement.png", "locations-placement-surface"],
            ["access", "08-access.png", "locations-access-surface"],
        ] as const) {
            await page.getByTestId(`locations-tab-${tab}`).click();
            await expect(page.getByTestId(surface)).toBeVisible();
            if (tab === "placement") {
                const scope = page.getByTestId("locations-placement-persistence-scope");
                if (await scope.isVisible().catch(() => false)) {
                    await expect(scope).toContainText("Saved on this work unit, not this location");
                    await expect(page.getByTestId("priority-active-factors")).toBeVisible();
                    await expect(page.getByText("Available factors", { exact: true })).toBeVisible();
                }
            }
            await page.screenshot({
                path: path.join(screenshotDir, filename),
                fullPage: true,
                animations: "disabled",
            });
        }

        await ensureSidebarExpanded(page);
        await page.screenshot({
            path: path.join(screenshotDir, "10-full-bos.png"),
            fullPage: true,
            animations: "disabled",
        });

        await expect(page.getByTestId("locations-object-selector")).toBeVisible();
        await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
        await expect(page.getByRole("tab", { name: "Access" })).toBeVisible();
        await expect(page.getByRole("tab", { name: "Communications" })).toHaveCount(0);
        await expect(page.getByTestId("locations-configuration-context")).toContainText("Locations");
        await expect(page.getByTestId("locations-configuration-page")).not.toContainText("Today's Tours");
        await expect(page.getByTestId("locations-configuration-page")).not.toContainText("Helpful Resources");
    });

    test("Add Location opens inline create workspace (not legacy drawer)", async ({ page }) => {
        test.setTimeout(600_000);
        await page.setViewportSize({ width: 1440, height: 960 });
        await ensureAdminPlaywrightSession(page);

        await page.goto("/settings/locations", {
            waitUntil: "domcontentloaded",
            timeout: 120_000,
        });
        await expect(page.getByTestId("locations-configuration-page")).toBeVisible({
            timeout: 60_000,
        });

        const addBtn = page.getByTestId("locations-fleet-add-location");
        if (await addBtn.isVisible().catch(() => false)) {
            await addBtn.click();
            await expect(page.getByTestId("locations-site-create")).toBeVisible({
                timeout: 30_000,
            });
            await page.screenshot({
                path: path.join(screenshotDir, "11-inline-location-create.png"),
                fullPage: true,
                animations: "disabled",
            });
        } else {
            const railAdd = page.getByTestId("locations-rail-add-location");
            await expect(railAdd).toBeVisible();
            await railAdd.click();
            await expect(page.getByTestId("locations-site-create")).toBeVisible({
                timeout: 30_000,
            });
        }
    });
});
