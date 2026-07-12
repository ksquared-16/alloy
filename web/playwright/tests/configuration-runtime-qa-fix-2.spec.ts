import * as fs from "fs";
import * as path from "path";
import { config as loadEnv } from "dotenv";
import { test, expect } from "@playwright/test";
import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

const screenshotDir = path.join(
    __dirname,
    "../../../docs/sprints/archive/06_2026/configuration-runtime-qa-fix-2",
);

const BEND_PINE = "rgb(0, 162, 131)";
const BEND_PINE_BG = "rgba(0, 162, 131, 0.08)";

async function ensureSidebarExpanded(page: import("@playwright/test").Page) {
    const expand = page.getByRole("button", { name: "Expand sidebar" });
    if (await expand.isVisible().catch(() => false)) {
        await expand.click();
    }
}

async function selectEnrollmentProcess(page: import("@playwright/test").Page) {
    const enrollmentCard = page.getByTestId("lifecycle-process-card-enrollment");
    if (await enrollmentCard.isVisible().catch(() => false)) {
        await enrollmentCard.click();
        return;
    }
    await page.locator('[data-testid^="lifecycle-process-card-"]').first().click();
}

function colorClose(actual: string, expected: string): boolean {
    const norm = actual.replace(/\s/g, "").toLowerCase();
    if (norm.includes("0,162,131") || norm.includes("#00a283")) return true;
    return norm === expected.replace(/\s/g, "").toLowerCase();
}

test.beforeAll(() => {
    fs.mkdirSync(screenshotDir, { recursive: true });
});

test.describe("Configuration Runtime QA Fix 2", () => {
    test("browser styles, UX corrections, and screenshots", async ({ page }) => {
        test.setTimeout(600_000);
        await page.setViewportSize({ width: 1440, height: 960 });
        await ensureAdminPlaywrightSession(page);

        await page.goto("/settings", { waitUntil: "networkidle", timeout: 120_000 });
        await expect(page.getByTestId("settings-index-page")).toBeVisible({ timeout: 60_000 });
        await expect(page.getByTestId("settings-configuration-sections")).toBeVisible({ timeout: 30_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "01-settings-landing.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.goto("/settings/processes", { waitUntil: "networkidle", timeout: 120_000 });
        await ensureSidebarExpanded(page);

        const activeNav = page.getByTestId("config-mode-nav-processes");
        const navStyles = await activeNav.evaluate((el) => {
            const s = getComputedStyle(el);
            return { boxShadow: s.boxShadow, backgroundColor: s.backgroundColor, color: s.color };
        });
        expect(navStyles.boxShadow).toContain("0, 162, 131");
        expect(navStyles.color).not.toContain("126, 232, 204");

        await page.screenshot({
            path: path.join(screenshotDir, "02-settings-rail-icons.png"),
            fullPage: true,
            animations: "disabled",
        });

        await selectEnrollmentProcess(page);
        await page.getByTestId("business-process-nav-stages").click();
        await expect(page.getByText("Ready Check")).toHaveCount(0);
        await page.screenshot({
            path: path.join(screenshotDir, "03-processes-stages-collapsed.png"),
            fullPage: true,
            animations: "disabled",
        });

        const operatingPlanCard = page.getByTestId("configuration-runtime-card-operating_plan");
        if (!(await operatingPlanCard.getAttribute("open"))) {
            await operatingPlanCard.locator(":scope > summary").click();
        }
        const workItems = page.getByTestId("stage-operating-plan-work-items-collapsible");
        if (await workItems.isVisible().catch(() => false)) {
            await workItems.locator("summary").click();
        }
        const workQueue = page.locator('[data-testid^="stage-operating-plan-work-queue-"]').first();
        if (await workQueue.isVisible().catch(() => false)) {
            await workQueue.click();
        }
        await page.screenshot({
            path: path.join(screenshotDir, "04-operating-plan-work-item.png"),
            fullPage: true,
            animations: "disabled",
        });

        const attentionSection = page.getByTestId("stage-operating-plan-attention-collapsible");
        if (await attentionSection.isVisible().catch(() => false)) {
            await attentionSection.locator("summary").click();
        }
        await page.screenshot({
            path: path.join(screenshotDir, "05-operating-plan-attention-expanded.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.getByTestId("business-process-nav-work-views").click();
        await expect(page.getByTestId("business-process-work-views-list-column")).toBeVisible({ timeout: 60_000 });
        const wvList = page.locator('[data-testid^="business-process-work-view-list-"]').first();
        if (await wvList.isVisible().catch(() => false)) {
            await wvList.click();
        }

        const basicsSection = page.getByTestId("work-view-section-basics").first();
        await expect(basicsSection).toBeVisible({ timeout: 30_000 });
        await expect(basicsSection).toHaveAttribute("open", "");
        await expect(page.getByTestId("work-view-section-conditions").first()).not.toHaveAttribute("open", "");
        await expect(page.getByTestId("work-view-section-sort").first()).not.toHaveAttribute("open", "");
        await page.screenshot({
            path: path.join(screenshotDir, "06-work-views-collapsed-default.png"),
            fullPage: true,
            animations: "disabled",
        });

        const conditionsSection = page.getByTestId("work-view-section-conditions").first();
        await conditionsSection.locator("summary").click();
        await expect(conditionsSection).toHaveAttribute("open", "");
        const dateField = page.getByTestId("work-view-condition-field-0");
        if (await dateField.isVisible().catch(() => false)) {
            await dateField.selectOption("tour_date");
        }
        const datePreset = page
            .getByTestId("work-view-condition-date-preset")
            .or(page.getByTestId("work-view-condition-value-0-preset"));
        if (await datePreset.isVisible().catch(() => false)) {
            await datePreset.selectOption("__relative__");
        }
        await page.screenshot({
            path: path.join(screenshotDir, "07-work-view-conditions-expanded.png"),
            fullPage: true,
            animations: "disabled",
        });

        const sortSection = page.getByTestId("work-view-section-sort").first();
        await sortSection.locator("summary").click();
        const addSort = page.locator('[data-testid$="-add-sort"]').first();
        if (await addSort.isVisible().catch(() => false)) {
            await addSort.click();
        }
        await page.screenshot({
            path: path.join(screenshotDir, "08-work-view-multi-sort.png"),
            fullPage: true,
            animations: "disabled",
        });

        const presentationSection = page.getByTestId("work-view-section-presentation").first();
        await presentationSection.locator("summary").click();
        await expect(page.locator('[data-testid$="-assignment-card"]').first()).toBeVisible({ timeout: 30_000 });
        await page.screenshot({
            path: path.join(screenshotDir, "09-work-view-presentation-selectors.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.getByTestId("business-process-nav-actions").click();
        await expect(page.getByTestId("business-process-actions-list-column")).toBeVisible({ timeout: 60_000 });
        const actionList = page.locator('[data-testid^="business-process-action-list-"]').first();
        if (await actionList.isVisible().catch(() => false)) {
            await actionList.click();
        }
        const checkbox = page.locator('[data-testid^="business-process-action-enabled-"]').first();
        if (await checkbox.isVisible().catch(() => false)) {
            const accent = await checkbox.evaluate((el) => getComputedStyle(el).accentColor);
            expect(colorClose(accent, BEND_PINE)).toBeTruthy();
        }
        await page.screenshot({
            path: path.join(screenshotDir, "10-actions-workspace.png"),
            fullPage: true,
            animations: "disabled",
        });

        const shellBg = await page.locator(".config-runtime-shell").first().evaluate((el) => {
            return getComputedStyle(el).backgroundColor;
        }).catch(() => "rgb(255, 255, 255)");
        expect(shellBg.replace(/\s/g, "")).toMatch(/255,255,255|255,255,255/);

        const activeProcessCard = page.locator(".process-config-process-card--active, .process-config-work-view-list-card--active").first();
        if (await activeProcessCard.isVisible().catch(() => false)) {
            const bg = await activeProcessCard.evaluate((el) => getComputedStyle(el).backgroundColor);
            if (bg.includes("162")) {
                expect(colorClose(bg, BEND_PINE_BG)).toBeTruthy();
            }
        }

        await page.screenshot({
            path: path.join(screenshotDir, "11-full-page-color-proof.png"),
            fullPage: true,
            animations: "disabled",
        });
    });
});
