import * as fs from "fs";
import * as path from "path";
import { config as loadEnv } from "dotenv";
import { test, expect } from "@playwright/test";
import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

const screenshotDir = path.join(__dirname, "../../../docs/sprints/archive/06_2026/configuration-runtime-concept-a");

const STAGE_TAB_CANDIDATES = ["lead", "touring", "tour", "waitlist", "enrolling", "enrolled", "new_leads"];

async function openWorkViewsCard(page: import("@playwright/test").Page) {
    const card = page.getByTestId("configuration-runtime-card-work-views");
    await card.scrollIntoViewIfNeeded();
    await card.evaluate((el) => {
        if (el instanceof HTMLDetailsElement) el.open = true;
    });
    await expect(page.getByTestId("lifecycle-stage-work-views-editor")).toBeVisible({ timeout: 30_000 });
}

async function openPresentationCard(page: import("@playwright/test").Page) {
    const card = page.getByTestId("configuration-runtime-card-presentation");
    await card.scrollIntoViewIfNeeded();
    await card.evaluate((el) => {
        if (el instanceof HTMLDetailsElement) el.open = true;
    });
    await expect(page.getByTestId("lifecycle-stage-presentation-card")).toBeVisible({ timeout: 30_000 });
}

async function selectEnrollmentProcess(page: import("@playwright/test").Page) {
    const enrollmentCard = page.getByTestId("lifecycle-process-card-enrollment");
    if (await enrollmentCard.isVisible().catch(() => false)) {
        await enrollmentCard.click();
        return;
    }
    await page.locator('[data-testid^="lifecycle-process-card-"]').first().click();
}

async function openStageWithWorkViews(page: import("@playwright/test").Page) {
    await expect(page.getByTestId("lifecycle-stage-nav-row")).toBeVisible({ timeout: 60_000 });
    for (const stageKey of STAGE_TAB_CANDIDATES) {
        const tab = page.getByTestId(`lifecycle-stage-tab-${stageKey}`);
        if (!(await tab.isVisible().catch(() => false))) continue;
        await tab.click();
        await expect(page.getByTestId("lifecycle-stage-workspace")).toBeVisible({ timeout: 60_000 });
        await openWorkViewsCard(page);
        const lensCount = await page.locator('[data-testid^="work-view-lens-"]').count();
        if (lensCount > 0) return stageKey;
    }
    await page.locator('[data-testid^="lifecycle-stage-tab-"]').first().click();
    await expect(page.getByTestId("lifecycle-stage-workspace")).toBeVisible({ timeout: 60_000 });
    return "fallback";
}

test.beforeAll(() => {
    fs.mkdirSync(screenshotDir, { recursive: true });
});

test.describe("Configuration Runtime Concept A UI", () => {
    test("business processes page uses Concept A navigation shell", async ({ page }) => {
        test.setTimeout(240_000);
        await page.setViewportSize({ width: 1440, height: 960 });
        await ensureAdminPlaywrightSession(page);

        await page.goto("/settings/business-processes", { waitUntil: "networkidle", timeout: 120_000 });
        await expect(page.getByTestId("settings-business-processes-page")).toBeVisible({ timeout: 60_000 });
        await expect(page.locator('[data-testid="configuration-workspace-nav"]')).toHaveCount(0);
        await expect(page.locator(".marketing-site-chrome")).toHaveCount(0);
        await expect(page.getByText("Perspectives", { exact: true })).toHaveCount(0);

        await page.screenshot({
            path: path.join(screenshotDir, "concept-a-process-hub.png"),
            fullPage: true,
            animations: "disabled",
        });

        await selectEnrollmentProcess(page);
        await expect(page.locator('[data-testid="lifecycle-process-catalog"][data-layout="compact-strip"]')).toBeVisible({
            timeout: 30_000,
        });

        const stageKey = await openStageWithWorkViews(page);
        await page.screenshot({
            path: path.join(screenshotDir, "concept-a-stage-workspace.png"),
            fullPage: true,
            animations: "disabled",
        });

        await page.screenshot({
            path: path.join(screenshotDir, "concept-a-work-view-card.png"),
            animations: "disabled",
        });

        await openPresentationCard(page);
        await page.screenshot({
            path: path.join(screenshotDir, "concept-a-presentation-card.png"),
            animations: "disabled",
        });

        await page.locator('[data-adminv2-app-shell="workspace-v2"]').scrollIntoViewIfNeeded();
        await page.screenshot({
            path: path.join(screenshotDir, "concept-a-full-page-bos-rail.png"),
            fullPage: true,
            animations: "disabled",
        });

        test.info().annotations.push({ type: "stageKey", description: stageKey });
    });
});
