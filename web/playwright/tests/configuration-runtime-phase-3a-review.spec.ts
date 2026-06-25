import * as fs from "fs";
import * as path from "path";
import { config as loadEnv } from "dotenv";
import { test, expect } from "@playwright/test";
import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

const reviewDir = path.join(__dirname, "../../../docs/sprints/06_2026/configuration-runtime-phase-3a");

const STAGE_TAB_CANDIDATES = ["lead", "touring", "tour", "waitlist", "enrolling", "enrolled", "new_leads"];

async function openPerspectivesCard(page: import("@playwright/test").Page) {
    const card = page.getByTestId("configuration-runtime-card-perspectives");
    await card.scrollIntoViewIfNeeded();
    await card.evaluate((el) => {
        if (el instanceof HTMLDetailsElement) el.open = true;
    });
    await expect(page.getByTestId("lifecycle-stage-perspectives-editor")).toBeVisible({ timeout: 30_000 });
}

async function openEnrollmentStageWithViews(page: import("@playwright/test").Page) {
    await page.goto("/settings/business-processes", { waitUntil: "networkidle", timeout: 120_000 });
    await expect(page.getByTestId("settings-business-processes-page")).toBeVisible({ timeout: 60_000 });

    const enrollmentCard = page.getByTestId("lifecycle-process-card-enrollment");
    if (await enrollmentCard.isVisible().catch(() => false)) {
        await enrollmentCard.click();
    } else {
        await page.locator('[data-testid^="lifecycle-process-card-"]').first().click();
    }

    await expect(page.getByTestId("lifecycle-stage-nav-row")).toBeVisible({ timeout: 60_000 });

    for (const stageKey of STAGE_TAB_CANDIDATES) {
        const tab = page.getByTestId(`lifecycle-stage-tab-${stageKey}`);
        if (!(await tab.isVisible().catch(() => false))) continue;
        await tab.click();
        await expect(page.getByTestId("lifecycle-stage-workspace")).toBeVisible({ timeout: 60_000 });
        await openPerspectivesCard(page);
        const lensCount = await page.locator('[data-testid^="perspective-lens-"]').count();
        if (lensCount > 0) return stageKey;
    }

    await page.locator('[data-testid^="lifecycle-stage-tab-"]').first().click();
    await expect(page.getByTestId("lifecycle-stage-workspace")).toBeVisible({ timeout: 60_000 });
    await openPerspectivesCard(page);
    return "fallback";
}

test.beforeAll(() => {
    fs.mkdirSync(reviewDir, { recursive: true });
});

test.describe("Configuration Runtime Phase 3A review", () => {
    test("unauthenticated /settings redirects to login", async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto("/settings/business-processes", { waitUntil: "networkidle", timeout: 60_000 });
        await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
        await context.close();
    });

    test("capture config ↔ runtime convergence screenshots", async ({ page }) => {
        test.setTimeout(360_000);
        await page.setViewportSize({ width: 1440, height: 960 });
        await ensureAdminPlaywrightSession(page);

        await page.goto("/settings/business-processes", { waitUntil: "networkidle", timeout: 120_000 });
        await expect(page.getByTestId("settings-business-processes-page")).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(reviewDir, "settings-business-processes-views.png"),
            fullPage: true,
            animations: "disabled",
        });

        const stageKey = await openEnrollmentStageWithViews(page);
        await page.screenshot({
            path: path.join(reviewDir, "configured-view-card.png"),
            fullPage: true,
            animations: "disabled",
        });

        const previewLink = page.locator('[data-testid^="perspective-preview-runtime-"]').first();
        if (await previewLink.isVisible().catch(() => false)) {
            await previewLink.scrollIntoViewIfNeeded();
            await page.screenshot({
                path: path.join(reviewDir, "preview-runtime-link.png"),
                animations: "disabled",
            });

            const href = await previewLink.getAttribute("href");
            if (href) {
                await page.goto(href, { waitUntil: "networkidle", timeout: 120_000 });
                await page.waitForTimeout(1500);
                await page.screenshot({
                    path: path.join(reviewDir, "runtime-work-unit-context-views.png"),
                    fullPage: true,
                    animations: "disabled",
                });

                const perspectiveRail = page.locator('[data-alloy-os-context-perspective-rail], [data-ws-command-pills]');
                if (await perspectiveRail.first().isVisible().catch(() => false)) {
                    await perspectiveRail.first().scrollIntoViewIfNeeded();
                    await page.screenshot({
                        path: path.join(reviewDir, "runtime-left-nav-views.png"),
                        animations: "disabled",
                    });
                }

                const queueBlock = page.locator('[data-testid="queue-block"], [data-alloy-os-queue-header]').first();
                if (await queueBlock.isVisible().catch(() => false)) {
                    await queueBlock.scrollIntoViewIfNeeded();
                    await page.screenshot({
                        path: path.join(reviewDir, "runtime-active-view-queue.png"),
                        fullPage: false,
                        animations: "disabled",
                    });
                }
            }
        }

        test.info().annotations.push({ type: "stageKey", description: stageKey });
    });
});
