import { test, expect } from "@playwright/test";
import path from "node:path";

const outDir = path.join(__dirname, "../../../docs/sprints/archive/06_2026/assets/bos-identity-system");

test.describe("BOS identity system gallery screenshots", () => {
    test("captures all identity frames", async ({ page }) => {
        await page.goto("/dev/bos-identity-system", { waitUntil: "networkidle", timeout: 60_000 });
        await expect(page.locator('[data-bos-identity-gallery="true"]')).toBeVisible();

        const frames = [
            "mark",
            "horizon",
            "smoke",
            "reveal-working",
            "reveal-workspace",
            "working",
            "button",
            "header",
            "notification",
            "shell",
            "applied",
        ];
        for (const frame of frames) {
            const el = page.locator(`[data-bos-identity-gallery-frame="${frame}"]`);
            await el.scrollIntoViewIfNeeded();
            await el.screenshot({ path: path.join(outDir, `${frame}.png`) });
        }

        await page.screenshot({
            path: path.join(outDir, "gallery-full.png"),
            fullPage: true,
        });
    });
});
