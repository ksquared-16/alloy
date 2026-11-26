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
const outDir = path.join(__dirname, "../../../docs/sprints/archive/06_2026/assets/518ab-browser-qa");

const COMPACT_PROBE_FN = () => {
    const compact = document.querySelector('[data-layout-runtime-related-list-compact="true"]');
    const stackedGrid = document.querySelector(".adminv2-drawer-enrollment-field-grid");
    return {
        compactPresent: Boolean(compact),
        rowLines: compact?.querySelectorAll("[data-layout-runtime-compact-row-line]").length ?? 0,
        inlineFields: compact?.querySelectorAll('[data-enrollment-inline-field="true"]').length ?? 0,
        inlineEditing: compact?.querySelectorAll('[data-enrollment-field-editing="true"]').length ?? 0,
        inlineCellInputs: compact?.querySelectorAll('[data-layout-runtime-field-variant="inline-cell"]').length ?? 0,
        fullWidthInputs: compact?.querySelectorAll("input.w-full, select.w-full").length ?? 0,
        displayOnlyFields:
            (compact?.querySelectorAll('[data-enrollment-inline-field="true"][data-enrollment-field-editing="false"]').length ?? 0),
        stackedGridPresent: Boolean(stackedGrid),
    };
};

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
            const sectionKeys = [...root.querySelectorAll("[data-layout-runtime-section-key]")].map((el) =>
                el.getAttribute("data-layout-runtime-section-key"),
            );
            const editTestIds = [...root.querySelectorAll("[data-testid^='layout-runtime-block-edit-']")].map(
                (el) => el.getAttribute("data-testid"),
            );
            return { sections, sectionKeys, editTestIds };
        });

        const probeBeforeEdit = await drawer.evaluate(COMPACT_PROBE_FN);

        await compactList.scrollIntoViewIfNeeded();

        const clickChildrenSectionEdit = async () => {
            await drawer.evaluate(() => {
                const compact = document.querySelector('[data-layout-runtime-related-list-compact="true"]');
                const panel =
                    compact?.closest("section[data-drawer-overview-panel]")
                    ?? compact?.closest("[data-drawer-overview-panel=\"true\"]")
                    ?? compact?.closest("[data-layout-runtime-section-key]");
                const edit =
                    panel?.querySelector('[data-testid^="layout-runtime-block-edit-"]')
                    ?? [...(panel?.querySelectorAll("button") ?? [])].find(
                        (btn) => btn.textContent?.trim() === "Edit",
                    );
                if (edit instanceof HTMLElement) edit.click();
            });
        };

        await clickChildrenSectionEdit();

        await expect
            .poll(async () => {
                return drawer.evaluate(COMPACT_PROBE_FN).then((p) => p.inlineEditing);
            }, { timeout: 10_000 })
            .toBeGreaterThan(0);

        const probeInEdit = await drawer.evaluate(COMPACT_PROBE_FN);

        const screenshotEditPath = path.join(outDir, `518ab-edit-${Date.now()}.png`);
        await page.screenshot({ path: screenshotEditPath, fullPage: false });

        await clickChildrenSectionEdit();
        await expect
            .poll(async () => {
                return drawer.evaluate(COMPACT_PROBE_FN).then((p) => p.inlineEditing);
            }, { timeout: 10_000 })
            .toBe(0);

        const probeAfterDone = await drawer.evaluate(COMPACT_PROBE_FN);

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
        expect(probeInEdit.displayOnlyFields).toBeGreaterThan(0);
        expect(probeInEdit.inlineFields - probeInEdit.inlineEditing).toBe(probeInEdit.displayOnlyFields);

        expect(probeAfterDone.inlineEditing).toBe(0);
    });
});
