import * as fs from "fs";
import * as path from "path";
import { config as loadEnv } from "dotenv";
import { test, expect } from "@playwright/test";
import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

const reviewDir = path.join(__dirname, "../../../docs/sprints/06_2026/configuration-runtime-phase-2b");

const STAGE_TAB_CANDIDATES = ["lead", "touring", "waitlist", "enrolling", "enrolled", "new_leads"];

async function openPerspectivesSection(page: import("@playwright/test").Page) {
    const section = page.getByTestId("lifecycle-stage-section-perspectives");
    await section.scrollIntoViewIfNeeded();
    await section.evaluate((el) => {
        if (el instanceof HTMLDetailsElement) el.open = true;
    });
    await expect(page.getByTestId("lifecycle-stage-perspectives-editor")).toBeVisible({ timeout: 30_000 });
}

async function stageHasPerspectiveRows(page: import("@playwright/test").Page): Promise<boolean> {
    const section = page.getByTestId("lifecycle-stage-section-perspectives");
    if (!(await section.isVisible().catch(() => false))) return false;
    await section.evaluate((el) => {
        if (el instanceof HTMLDetailsElement) el.open = true;
    });
    if (await page.getByTestId("perspectives-no-lanes").isVisible().catch(() => false)) return false;
    return (await page.locator('[data-testid^="perspective-row-"]').count()) > 0;
}

async function openEnrollmentStageWorkspace(page: import("@playwright/test").Page) {
    await page.goto("/settings/business-processes", { waitUntil: "networkidle", timeout: 120_000 });
    await expect(page.getByTestId("settings-business-processes-page")).toBeVisible({ timeout: 60_000 });

    const enrollmentCard = page.getByTestId("lifecycle-process-card-enrollment");
    if (await enrollmentCard.isVisible().catch(() => false)) {
        await enrollmentCard.click();
    } else {
        const firstCard = page.locator('[data-testid^="lifecycle-process-card-"]').first();
        await expect(firstCard).toBeVisible({ timeout: 30_000 });
        await firstCard.click();
    }

    await expect(page.getByTestId("lifecycle-stage-nav-row")).toBeVisible({ timeout: 60_000 });

    for (const stageKey of STAGE_TAB_CANDIDATES) {
        const tab = page.getByTestId(`lifecycle-stage-tab-${stageKey}`);
        if (!(await tab.isVisible().catch(() => false))) continue;
        await tab.click();
        await expect(page.getByTestId("lifecycle-stage-workspace")).toBeVisible({ timeout: 60_000 });
        if (await stageHasPerspectiveRows(page)) {
            return stageKey;
        }
    }

    const fallbackTab = page.locator('[data-testid^="lifecycle-stage-tab-"]').first();
    await fallbackTab.click();
    await expect(page.getByTestId("lifecycle-stage-workspace")).toBeVisible({ timeout: 60_000 });
    return (await fallbackTab.getAttribute("data-testid"))?.replace("lifecycle-stage-tab-", "") ?? "unknown";
}

test.beforeAll(() => {
    fs.mkdirSync(reviewDir, { recursive: true });
});

test.describe("Configuration Runtime Phase 2B design review screenshots", () => {
    test("capture Perspectives section and save flow", async ({ page }) => {
        test.setTimeout(300_000);
        await page.setViewportSize({ width: 1440, height: 960 });
        await ensureAdminPlaywrightSession(page);

        await page.goto("/settings", { waitUntil: "networkidle", timeout: 120_000 });
        await expect(page.getByTestId("settings-index-page")).toBeVisible({ timeout: 60_000 });
        await page.screenshot({
            path: path.join(reviewDir, "settings-hub.png"),
            fullPage: true,
            animations: "disabled",
        });

        const stageKey = await openEnrollmentStageWorkspace(page);

        await page.screenshot({
            path: path.join(reviewDir, "business-processes-stage-workspace.png"),
            fullPage: true,
            animations: "disabled",
        });

        await openPerspectivesSection(page);

        const perspectivesSection = page.getByTestId("lifecycle-stage-section-perspectives");
        await perspectivesSection.screenshot({
            path: path.join(reviewDir, "perspectives-section-default.png"),
            animations: "disabled",
        });

        const firstRow = page.locator('[data-testid^="perspective-row-"]').first();
        await expect(firstRow).toBeVisible({ timeout: 15_000 });
        const queueKeyAttr = (await firstRow.getAttribute("data-testid"))?.replace("perspective-row-", "") ?? "";
        const editedLabel = `Review lane ${Date.now().toString().slice(-4)}`;
        const editedMission = `Mission proof for ${stageKey} — visual review capture.`;

        await page.getByTestId(`perspective-label-${queueKeyAttr}`).fill(editedLabel);
        await page.getByTestId(`perspective-mission-${queueKeyAttr}`).fill(editedMission);
        await page.getByTestId(`perspective-order-${queueKeyAttr}`).fill("2");
        const visibleCheckbox = page.getByTestId(`perspective-visible-${queueKeyAttr}`);
        if (await visibleCheckbox.isChecked()) {
            await visibleCheckbox.uncheck();
        } else {
            await visibleCheckbox.check();
        }

        await expect(page.getByTestId("lifecycle-stage-save-unsaved")).toBeVisible({ timeout: 15_000 });

        await openPerspectivesSection(page);
        await firstRow.scrollIntoViewIfNeeded();
        await firstRow.screenshot({
            path: path.join(reviewDir, "perspective-card-edited-dirty.png"),
            animations: "disabled",
        });

        await page.getByTestId("lifecycle-stage-save").click();
        await expect(page.getByTestId("lifecycle-stage-save-saved")).toBeVisible({ timeout: 90_000 });

        await page.reload({ waitUntil: "networkidle", timeout: 120_000 });
        await openEnrollmentStageWorkspace(page);
        const reloadTab = page.getByTestId(`lifecycle-stage-tab-${stageKey}`);
        if (await reloadTab.isVisible().catch(() => false)) {
            await reloadTab.click();
        }
        await openPerspectivesSection(page);
        await expect(page.getByTestId(`perspective-label-${queueKeyAttr}`)).toHaveValue(editedLabel, {
            timeout: 30_000,
        });
        await expect(page.getByTestId(`perspective-mission-${queueKeyAttr}`)).toHaveValue(editedMission);

        await page.getByTestId(`perspective-row-${queueKeyAttr}`).scrollIntoViewIfNeeded();
        await page.getByTestId(`perspective-row-${queueKeyAttr}`).screenshot({
            path: path.join(reviewDir, "perspective-card-saved-reloaded.png"),
            animations: "disabled",
        });
    });
});
