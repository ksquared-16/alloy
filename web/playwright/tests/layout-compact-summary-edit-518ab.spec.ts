/**
 * Sprint 5.18AB — browser QA for compact-summary related-list edit + additional contact.
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

test.describe("518AB compact summary edit browser QA", () => {
    test.skip(!LIVE, "Set PLAYWRIGHT_518AB_QA=1");
    test.describe.configure({ timeout: 300_000 });

    test.beforeEach(async ({ page }) => {
        await ensureAdminPlaywrightSession(page);
    });

    test("published drawer compact summary edit keeps inline row layout", async ({ page }) => {
        test.setTimeout(300_000);
        fs.mkdirSync(outDir, { recursive: true });

        const recordUrl = `/adminV2/workspace/work-unit/${WORK_UNIT_SLUG}`;
        await page.setViewportSize({ width: 1600, height: 1000 });
        await page.goto(recordUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });

        await page.waitForFunction(
            () => document.documentElement.getAttribute("data-adminv2-workspace-shell") === "v2",
            null,
            { timeout: 60_000 },
        );

        const wrightRow = page.getByRole("button", { name: /Wright Family/i }).first();
        await expect(wrightRow).toBeVisible({ timeout: 60_000 });
        await wrightRow.click();

        const drawer = page.getByRole("dialog").first();
        await expect(drawer).toBeVisible({ timeout: 180_000 });

        const compactList = drawer.locator('[data-layout-runtime-related-list-compact="true"]').first();
        const compactVisible = await compactList.isVisible().catch(() => false);

        const probeBeforeEdit = await page.evaluate(() => {
            const compact = document.querySelector('[data-layout-runtime-related-list-compact="true"]');
            const stackedGrid = document.querySelector(".adminv2-drawer-enrollment-field-grid");
            const rowLines = compact?.querySelectorAll("[data-layout-runtime-compact-row-line]").length ?? 0;
            const inlineFields = compact?.querySelectorAll('[data-enrollment-inline-field="true"]').length ?? 0;
            const additionalContactBlock = [...document.querySelectorAll("[data-layout-runtime-ref-key]")].find(
                (el) => el.textContent?.includes("Jordan") || el.textContent?.includes("secondary"),
            );
            return {
                compactPresent: Boolean(compact),
                rowLines,
                inlineFields,
                stackedGridPresent: Boolean(stackedGrid),
                additionalContactHint: additionalContactBlock?.textContent?.slice(0, 80) ?? null,
            };
        });

        if (compactVisible) {
            await compactList.scrollIntoViewIfNeeded();
            const childrenPanel = drawer.locator('[data-drawer-overview-panel-section="children_enrollment"]');
            const editButton = childrenPanel.getByRole("button", { name: "Edit" });
            if (await editButton.count()) {
                await editButton.click({ force: true, timeout: 5_000 }).catch(() => undefined);
                await page.waitForTimeout(800);
            }
        }

        let editProbe = probeBeforeEdit;
        if (compactVisible) {
            editProbe = await page.evaluate(() => {
                const compact = document.querySelector('[data-layout-runtime-related-list-compact="true"]');
                const stackedGrid = document.querySelector(".adminv2-drawer-enrollment-field-grid");
                const rowLines = compact?.querySelectorAll("[data-layout-runtime-compact-row-line]").length ?? 0;
                const inlineEditing = compact?.querySelectorAll('[data-enrollment-field-editing="true"]').length ?? 0;
                const inlineCellInputs =
                    compact?.querySelectorAll('[data-layout-runtime-field-variant="inline-cell"]').length ?? 0;
                const fullWidthInputs = compact?.querySelectorAll("input.w-full, select.w-full").length ?? 0;
                const householdText = document.body.innerText;
                return {
                    compactPresent: Boolean(compact),
                    rowLines,
                    inlineEditing,
                    inlineCellInputs,
                    fullWidthInputs,
                    stackedGridPresent: Boolean(stackedGrid),
                    additionalContactVisible:
                        householdText.includes("Molly Wright")
                        || householdText.includes("Jordan Wright")
                        || householdText.includes("Additional Contact"),
                };
            });
        }

        const screenshotPath = path.join(outDir, `518ab-${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });

        const report = {
            recordUrl,
            openedFrom: "Wright Family queue row",
            compactVisible,
            probeBeforeEdit,
            editProbe,
            screenshotPath,
        };
        fs.writeFileSync(path.join(outDir, "518ab-report.json"), JSON.stringify(report, null, 2));

        if (compactVisible) {
            expect(editProbe.stackedGridPresent).toBe(false);
            expect(editProbe.rowLines).toBeGreaterThan(0);
            if (editProbe.inlineEditing > 0) {
                expect(editProbe.inlineCellInputs).toBeGreaterThan(0);
                expect(editProbe.fullWidthInputs).toBe(0);
            }
        }
    });
});
