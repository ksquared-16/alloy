import * as fs from "fs";
import * as path from "path";
import { test, expect } from "@playwright/test";

const shotDir = path.join(__dirname, "../../../docs/sprints/06_2026/assets/action-workspace-drawer-regression");

test.beforeAll(() => {
    fs.mkdirSync(shotDir, { recursive: true });
});

test.describe("Create Lead workspace drawer regression", () => {
    test("panel is position fixed and visible between sidebar and BOS rail", async ({ page }) => {
        await page.setViewportSize({ width: 1600, height: 1000 });
        await page.goto("/dev/action-workspace-drawer-regression", { waitUntil: "networkidle", timeout: 60_000 });

        const panel = page.locator('[data-action-workspace-bos-drawer="true"]');
        await expect(panel).toBeVisible({ timeout: 15_000 });

        const metrics = await panel.evaluate((el) => {
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return {
                position: style.position,
                opacity: style.opacity,
                visibility: style.visibility,
                display: style.display,
                zIndex: style.zIndex,
                left: style.left,
                width: style.width,
                height: style.height,
                rectTop: rect.top,
                rectLeft: rect.left,
                rectWidth: rect.width,
                rectHeight: rect.height,
            };
        });

        expect(metrics.position).toBe("fixed");
        expect(Number(metrics.opacity)).toBeGreaterThan(0);
        expect(metrics.visibility).not.toBe("hidden");
        expect(metrics.display).not.toBe("none");
        expect(metrics.rectWidth).toBeGreaterThan(200);
        expect(metrics.rectHeight).toBeGreaterThan(200);
        expect(metrics.rectTop).toBeGreaterThanOrEqual(0);
        expect(metrics.rectLeft).toBeGreaterThan(280);

        await page.screenshot({
            path: path.join(shotDir, "create-lead-workspace-drawer-fixed.png"),
            fullPage: false,
            animations: "disabled",
        });
    });
});
