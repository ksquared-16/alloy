import { config as loadEnv } from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { test, expect } from "@playwright/test";

import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

/**
 * Live validation — Universal Nested Surface Drill-In (Focus Panel surface path only).
 *
 * Validates /settings/surfaces builder + Focus Panel runtime via the dev harness.
 * Does NOT use the legacy Opportunity drawer or workspace queue.
 *
 * Run: PLAYWRIGHT_NESTED_SURFACE_VALIDATION=1 npx playwright test \
 *   playwright/tests/nested-surface-drill-in-validation.spec.ts --project=chromium
 */
const LIVE = process.env.PLAYWRIGHT_NESTED_SURFACE_VALIDATION === "1";
const outDir = path.join(__dirname, "../../../docs/sprints/07_2026/nested-surface-drill-in-validation");

async function openEnrollmentFocusPanelBuilder(page: import("@playwright/test").Page) {
    await page.goto("/settings/surfaces", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await expect(page.getByTestId("surfaces-configuration-page")).toBeVisible({ timeout: 60_000 });
    await page.locator('[data-surface-library-open="enrollment-focus-panel-summary"]').click();
    await expect(page.getByTestId("focus-panel-summary-surface-editor")).toBeVisible({ timeout: 60_000 });
}

test.describe("Nested surface drill-in — Focus Panel surface validation", () => {
    test.skip(!LIVE, "Set PLAYWRIGHT_NESTED_SURFACE_VALIDATION=1");
    test.describe.configure({ timeout: 300_000 });

    test.beforeEach(async ({ page }) => {
        await ensureAdminPlaywrightSession(page);
        fs.mkdirSync(outDir, { recursive: true });
    });

    test("builder: card-body drill-in, breadcrumb back to canvas, no duplicate labels", async ({ page }) => {
        await openEnrollmentFocusPanelBuilder(page);
        await page.screenshot({ path: path.join(outDir, "01-focus-panel-builder-canvas.png"), fullPage: true });

        const childrenCardBody = page.locator('[data-grid-area="children"] [data-grid-card-body="children"]');
        await expect(childrenCardBody).toBeVisible({ timeout: 30_000 });
        await childrenCardBody.click({ position: { x: 12, y: 12 } });
        await expect(page.locator('[data-nested-surface-editor="children_surface"]')).toBeVisible({ timeout: 30_000 });

        const breadcrumb = page.getByTestId("surfaces-breadcrumb");
        await expect(breadcrumb).toContainText("Children card");
        await expect(breadcrumb).not.toHaveText(/Children\s*›\s*Children\s*$/);
        await expect(page.locator('[data-nested-surface-groups="children_surface"]')).toBeVisible({ timeout: 10_000 });
        await page.screenshot({ path: path.join(outDir, "02-children-nested-editor.png"), fullPage: true });

        // Section crumb returns to Focus Panel canvas — not the Surfaces library.
        await page.locator('[data-breadcrumb-crumb="1"]').click();
        await expect(page.getByTestId("focus-panel-summary-surface-editor")).toBeVisible({ timeout: 30_000 });
        await expect(page.locator('[data-nested-surface-editor="children_surface"]')).toHaveCount(0);

        // Affordance still drills in for billing nested surface.
        await page.locator('[data-open-nested-surface="financial_configuration_surface"]').click();
        await expect(page.locator('[data-nested-surface-editor="financial_configuration_surface"]')).toBeVisible();
        await page.screenshot({ path: path.join(outDir, "03-financial-nested-editor.png"), fullPage: true });

        await page.locator('[data-breadcrumb-crumb="2"]').click();
        await expect(page.getByTestId("focus-panel-summary-surface-editor")).toBeVisible({ timeout: 30_000 });
    });

    test("builder: edit groups, publish, and nested editor shows groups while hydrating", async ({ page }) => {
        await openEnrollmentFocusPanelBuilder(page);
        await page.locator('[data-grid-area="children"] [data-grid-card-body="children"]').click({ position: { x: 12, y: 12 } });
        await expect(page.locator('[data-nested-surface-editor="children_surface"]')).toBeVisible();

        await expect(page.locator('[data-nested-surface-groups="children_surface"]')).toBeVisible({ timeout: 5_000 });
        const placementGroup = page.locator('[data-nested-group="placement"]');
        await expect(placementGroup).toBeVisible();
        const selectedCount = await placementGroup.locator("[data-nested-field]").count();
        expect(selectedCount).toBeGreaterThan(0);

        await placementGroup.locator('[data-nested-add-field="placement"]').click();
        const picker = page.locator('[data-nested-add-picker="placement"]');
        await expect(picker).toBeVisible();
        const firstAvailable = picker.locator("[data-nested-available-field]").first();
        if (await firstAvailable.isVisible()) {
            const key = await firstAvailable.getAttribute("data-nested-available-field");
            await firstAvailable.click();
            await expect(placementGroup.locator(`[data-nested-field="${key}"]`)).toHaveCount(1);
        }

        await page.locator("[data-nested-surface-save]").click();
        await expect(page.locator("[data-nested-surface-status]")).toContainText(/Published|Saving/i, { timeout: 60_000 });
        await page.screenshot({ path: path.join(outDir, "04-nested-publish-success.png"), fullPage: true });
    });

    test("runtime: Focus Panel cards render published nested fields (no drawer)", async ({ page }) => {
        await page.setViewportSize({ width: 1400, height: 1200 });
        await page.goto("/dev/household-card-verify", { waitUntil: "networkidle", timeout: 120_000 });

        await expect(page.locator(".adminv2-drawer-modal-panel")).toHaveCount(0);

        const composition = page.locator("[data-overview-composition='true']");
        await expect(composition).toBeVisible({ timeout: 30_000 });

        const childrenCard = page.locator('[data-children-card="true"]').first();
        await expect(childrenCard).toBeVisible({ timeout: 30_000 });
        await expect(childrenCard.locator('[data-children-empty="true"]')).toHaveCount(0);

        await childrenCard.locator('[data-children-action="expand"]').click();
        await expect(childrenCard.locator("[data-children-roster]")).toBeVisible({ timeout: 15_000 });
        await expect(childrenCard.locator("[data-children-roster] [data-children-child]").first()).toBeVisible({
            timeout: 15_000,
        });
        await expect(childrenCard.locator("[data-children-roster] .alloy-os-children__summary-line").first()).toBeVisible({
            timeout: 15_000,
        });

        await composition.screenshot({ path: path.join(outDir, "05-runtime-focus-panel-children-expanded.png") });
        await page.screenshot({ path: path.join(outDir, "06-runtime-focus-panel-harness.png"), fullPage: true });
    });
});
