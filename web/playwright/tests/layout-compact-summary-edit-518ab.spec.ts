/**
 * Sprint 5.18AB — browser QA for compact-summary related-list edit.
 *
 * Run: PLAYWRIGHT_518AB_QA=1 npx playwright test layout-compact-summary-edit-518ab
 */

import { config as loadEnv } from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { test, expect } from "@playwright/test";

import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

const LIVE = process.env.PLAYWRIGHT_518AB_QA === "1";
const WORK_UNIT_SLUG = "new-leads";
const outDir = path.join(__dirname, "../../../docs/sprints/06_2026/assets/518ab-browser-qa");

function probeCompactList(root: ParentNode) {
    const compact = root.querySelector('[data-layout-runtime-related-list-compact="true"]');
    const stackedGrid = root.querySelector(".adminv2-drawer-enrollment-field-grid");
    return {
        compactPresent: Boolean(compact),
        rowLines: compact?.querySelectorAll("[data-layout-runtime-compact-row-line]").length ?? 0,
        inlineFields: compact?.querySelectorAll('[data-enrollment-inline-field="true"]').length ?? 0,
        inlineEditing: compact?.querySelectorAll('[data-enrollment-field-editing="true"]').length ?? 0,
        inlineCellInputs: compact?.querySelectorAll('[data-layout-runtime-field-variant="inline-cell"]').length ?? 0,
        fullWidthInputs: compact?.querySelectorAll("input.w-full, select.w-full").length ?? 0,
        displayOnlyNameAge:
            compact?.querySelectorAll('[data-layout-runtime-ref-key="child.name"][data-enrollment-field-editing="false"]').length ?? 0,
        stackedGridPresent: Boolean(stackedGrid),
    };
}

test.describe("518AB compact summary edit browser QA", () => {
    test.skip(!LIVE, "Set PLAYWRIGHT_518AB_QA=1");
    test.describe.configure({ timeout: 300_000 });

    test.beforeEach(async ({ page }) => {
        await ensureAdminPlaywrightSession(page);
    });

    test("Wright Family Children Edit keeps compact inline row layout", async ({ page }) => {
        test.setTimeout(300_000);
        fs.mkdirSync(outDir, { recursive: true });

        await page.setViewportSize({ width: 1600, height: 1000 });
        await page.goto(`/adminV2/workspace/work-unit/${WORK_UNIT_SLUG}`, {
            waitUntil: "domcontentloaded",
            timeout: 120_000,
        });

        await page.waitForFunction(
            () => document.documentElement.getAttribute("data-adminv2-workspace-shell") === "v2",
            null,
            { timeout: 60_000 },
        );

        await page.getByRole("button", { name: /Wright Family/i }).first().click();

        const drawer = page.getByRole("dialog", { name: /Wright Family/i });
        await expect(drawer).toBeVisible({ timeout: 180_000 });

        const compactList = drawer.locator('[data-layout-runtime-related-list-compact="true"]').first();
        await expect(compactList).toBeVisible({ timeout: 60_000 });

        const debugBefore = await drawer.evaluate((root) => {
            const sections = [...root.querySelectorAll("[data-drawer-overview-panel-section]")].map((el) =>
                el.getAttribute("data-drawer-overview-panel-section"),
            );
            const editTestIds = [...root.querySelectorAll("[data-testid^='layout-runtime-block-edit-']")].map(
                (el) => el.getAttribute("data-testid"),
            );
            return { sections, editTestIds };
        });

        const childrenPanel = drawer.locator(
            'section[data-drawer-overview-panel-section="children_enrollment"], [data-layout-runtime-section-key="children_enrollment"]',
        ).first();
        await expect(childrenPanel).toBeVisible({ timeout: 15_000 });

        const probeBeforeEdit = await drawer.evaluate((root) => probeCompactList(root));

        await compactList.scrollIntoViewIfNeeded();
        await childrenPanel.hover();

        const childrenEdit = drawer.locator('[data-testid="layout-runtime-block-edit-children_enrollment"]');
        const editFallback = childrenPanel.getByRole("button", { name: /^Edit$/ });
        const editLocator = (await childrenEdit.count()) > 0 ? childrenEdit : editFallback;

        await expect(editLocator).toBeAttached({ timeout: 10_000 });
        await editLocator.click({ force: true });

        await expect
            .poll(async () => {
                return drawer.evaluate((root) => probeCompactList(root).inlineEditing);
            }, { timeout: 10_000 })
            .toBeGreaterThan(0);

        const probeInEdit = await drawer.evaluate((root) => probeCompactList(root));

        const screenshotEditPath = path.join(outDir, `518ab-edit-${Date.now()}.png`);
        await page.screenshot({ path: screenshotEditPath, fullPage: false });

        await editLocator.click({ force: true });
        await expect
            .poll(async () => {
                return drawer.evaluate((root) => probeCompactList(root).inlineEditing);
            }, { timeout: 10_000 })
            .toBe(0);

        const probeAfterDone = await drawer.evaluate((root) => probeCompactList(root));

        const report = {
            recordUrl: `/adminV2/workspace/work-unit/${WORK_UNIT_SLUG}`,
            openedFrom: "Wright Family queue row",
            debugBefore,
            probeBeforeEdit,
            probeInEdit,
            probeAfterDone,
            screenshotEditPath,
        };
        fs.writeFileSync(path.join(outDir, "518ab-report.json"), JSON.stringify(report, null, 2));

        expect(probeBeforeEdit.stackedGridPresent).toBe(false);
        expect(probeBeforeEdit.rowLines).toBeGreaterThan(0);

        expect(probeInEdit.inlineEditing).toBeGreaterThan(0);
        expect(probeInEdit.inlineCellInputs).toBeGreaterThan(0);
        expect(probeInEdit.fullWidthInputs).toBe(0);
        expect(probeInEdit.stackedGridPresent).toBe(false);
        expect(probeInEdit.rowLines).toBe(probeBeforeEdit.rowLines);
        expect(probeInEdit.displayOnlyNameAge).toBeGreaterThan(0);

        expect(probeAfterDone.inlineEditing).toBe(0);
    });
});
