import * as fs from "fs";
import * as path from "path";
import { test, expect } from "@playwright/test";

/**
 * Live BOS + drawer geometry capture.
 * Requires authenticated admin session (same as queue live audits).
 *
 * PLAYWRIGHT_BOS_GEOMETRY=1 npx playwright test bos-drawer-geometry-report
 */
const LIVE = process.env.PLAYWRIGHT_BOS_GEOMETRY === "1";
const outDir = path.join(__dirname, "../../../docs/sprints/archive/06_2026/assets/bos-drawer-geometry");

test.describe("BOS drawer geometry report", () => {
    test.skip(!LIVE, "Set PLAYWRIGHT_BOS_GEOMETRY=1 to capture geometry");

    test.beforeAll(() => {
        fs.mkdirSync(outDir, { recursive: true });
    });

    test("measure drawer + BOS overlay and save report", async ({ page }) => {
        test.setTimeout(60_000);
        await page.setViewportSize({ width: 1600, height: 1000 });
        await page.goto("/dev/bos-drawer-geometry", { waitUntil: "networkidle", timeout: 60_000 });

        const drawer = page.locator("[data-adminv2-drawer='true']").first();
        await expect(drawer).toBeVisible({ timeout: 15_000 });

        const bosOverlay = page.locator("[data-adminv2-bos-rail-overlay='true']");
        await expect(bosOverlay).toBeVisible({ timeout: 15_000 });

        await page.waitForFunction(() => typeof window.__alloyReportBosDrawerGeometry === "function", null, {
            timeout: 15_000,
        });

        const report = await page.evaluate(() => {
            return window.__alloyReportBosDrawerGeometry?.({ highlight: true });
        });

        expect(report).toBeTruthy();
        fs.writeFileSync(
            path.join(outDir, "geometry-report.json"),
            JSON.stringify(report, null, 2),
            "utf8"
        );

        await page.screenshot({
            path: path.join(outDir, "drawer-with-bos.png"),
            fullPage: false,
            animations: "disabled",
        });

        // eslint-disable-next-line no-console -- playwright artifact
        console.log(JSON.stringify(report?.geometry, null, 2));
        // eslint-disable-next-line no-console -- playwright artifact
        console.log(report?.recommendations);
    });
});
