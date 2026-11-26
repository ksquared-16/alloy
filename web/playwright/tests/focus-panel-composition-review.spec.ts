import { config as loadEnv } from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { test, expect, type Page } from "@playwright/test";

import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

/**
 * Focus Panel Composition Review (Core Four).
 * Captures the REAL operator Focus Panel Summary (authenticated work-unit record
 * route) plus the dev composition preview, for the composition sprint deliverable.
 *
 * Run: PLAYWRIGHT_COMPOSITION_REVIEW=1 npx playwright test \
 *   playwright/tests/focus-panel-composition-review.spec.ts --project=chromium
 */
const LIVE = process.env.PLAYWRIGHT_COMPOSITION_REVIEW === "1";
const WORK_UNIT_SLUGS = (process.env.COMPOSITION_REVIEW_SLUGS || "lifecycle-lead,new-leads,leads,tours,inquiries")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const outDir = path.join(
    __dirname,
    "../../../docs/sprints/archive/06_2026/focus-panel-composition-review",
);

const ROW_SELECTOR = "[data-alloy-os-compressed-row='true']";

/** Navigate the queue UI and open the first record, returning the slug that worked. */
async function openFirstRecord(page: Page): Promise<string | null> {
    for (const slug of WORK_UNIT_SLUGS) {
        await page
            .goto(`/workspace/work-unit/${slug}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
            .catch(() => {});
        const path0 = new URL(page.url()).pathname;
        if (path0 === "/login" || path0.startsWith("/unauthorized")) continue;
        const row = page.locator(ROW_SELECTOR).first();
        const appeared = await row
            .waitFor({ state: "visible", timeout: 20_000 })
            .then(() => true)
            .catch(() => false);
        if (!appeared) continue;
        await row.click();
        const panel = page.locator(".adminv2-drawer-modal-panel").first();
        const opened = await panel
            .waitFor({ state: "visible", timeout: 60_000 })
            .then(() => true)
            .catch(() => false);
        if (opened) return slug;
    }
    return null;
}

test.describe("Focus Panel composition review (Core Four)", () => {
    test.skip(!LIVE, "Set PLAYWRIGHT_COMPOSITION_REVIEW=1");
    test.describe.configure({ timeout: 300_000 });

    test.beforeEach(async ({ page }) => {
        await ensureAdminPlaywrightSession(page);
    });

    test("capture real operator Focus Panel Summary + dev composition preview", async ({ page }) => {
        test.setTimeout(300_000);
        fs.mkdirSync(outDir, { recursive: true });

        // ── Dev composition preview (real grid + footprints, fixture data) ──
        await page.setViewportSize({ width: 1200, height: 1400 });
        await page.goto("/dev/household-card-verify", { waitUntil: "networkidle", timeout: 120_000 });
        const composition = page.locator("[data-overview-composition='true']");
        await expect(composition).toBeVisible({ timeout: 30_000 });
        await composition.screenshot({ path: path.join(outDir, "10-dev-overview-composition.png") });

        // ── Real operator Focus Panel Summary ──
        await page.setViewportSize({ width: 1680, height: 1050 });
        const slug = await openFirstRecord(page);
        // eslint-disable-next-line no-console -- playwright artifact
        console.log("openedSlug:", slug, "url:", page.url());
        if (!slug) {
            fs.writeFileSync(
                path.join(outDir, "_no-record.txt"),
                `No record opened. Tried slugs: ${WORK_UNIT_SLUGS.join(", ")}\n`,
                "utf8",
            );
            return;
        }

        const panel = page.locator(".adminv2-drawer-modal-panel").first();
        await expect(panel).toBeVisible({ timeout: 180_000 });

        const grid = page.locator("[data-focus-panel-card-grid='true']").first();
        await grid.waitFor({ state: "visible", timeout: 60_000 }).catch(() => {});
        // Allow card composition + perspective derivation to settle.
        await page.waitForTimeout(1200);

        await page.screenshot({ path: path.join(outDir, "01-operator-full-page.png") });
        await panel.screenshot({ path: path.join(outDir, "02-operator-focus-panel.png") });

        const gridCount = await grid.count();
        if (gridCount > 0) {
            const box = await grid.boundingBox();
            if (box) {
                await page.screenshot({
                    path: path.join(outDir, "03-operator-summary-grid.png"),
                    clip: {
                        x: Math.max(0, box.x - 6),
                        y: Math.max(0, box.y - 6),
                        width: Math.min(box.width + 12, 1680),
                        height: Math.min(box.height + 12, 1040),
                    },
                });
            }
        }

        // Report which card keys actually rendered in the Summary grid.
        const renderedKeys = await page.evaluate(() => {
            const cells = Array.from(
                document.querySelectorAll("[data-focus-panel-grid-cell]"),
            );
            return cells.map((c) => ({
                key: c.getAttribute("data-focus-panel-grid-cell"),
                span: c.getAttribute("data-focus-panel-grid-span"),
            }));
        });
        // eslint-disable-next-line no-console -- playwright artifact
        console.log("renderedSummaryCells:", JSON.stringify(renderedKeys));
        fs.writeFileSync(
            path.join(outDir, "_rendered-cells.json"),
            JSON.stringify({ recordUrl: page.url(), slug, cells: renderedKeys }, null, 2),
            "utf8",
        );

        expect(renderedKeys.length).toBeGreaterThan(0);
    });
});
