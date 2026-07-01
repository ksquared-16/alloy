import * as fs from "fs";
import * as path from "path";
import { test, expect } from "@playwright/test";

const outDir = path.join(
    __dirname,
    "../../../docs/sprints/06_2026/assets/bos-operational-intake-shell-lock",
);

test.beforeAll(() => {
    fs.mkdirSync(outDir, { recursive: true });
});

test.describe("BOS Operational Intake locked shell", () => {
    test("capture desktop, laptop, and before/after", async ({ page }) => {
        test.setTimeout(120_000);

        await page.goto("/dev/bos-operational-intake-shell-lock", {
            waitUntil: "domcontentloaded",
            timeout: 90_000,
        });
        await expect(page.getByRole("heading", { name: /Locked Shell/i })).toBeVisible({
            timeout: 30_000,
        });

        await page.setViewportSize({ width: 1920, height: 1200 });
        const desktop = page.locator('[data-mockup="operational-intake-shell-lock-desktop"]');
        await expect(desktop).toBeVisible();
        await desktop.screenshot({
            path: path.join(outDir, "desktop-locked-shell.png"),
            animations: "disabled",
        });

        await page.setViewportSize({ width: 1280, height: 800 });
        const laptop = page.locator('[data-mockup="operational-intake-shell-lock-laptop"]');
        await expect(laptop).toBeVisible();
        await laptop.screenshot({
            path: path.join(outDir, "laptop-locked-shell.png"),
            animations: "disabled",
        });

        await page.setViewportSize({ width: 1920, height: 1200 });
        const comparison = page.locator('[data-mockup="operational-intake-shell-before-after"]');
        await expect(comparison).toBeVisible();
        await comparison.screenshot({
            path: path.join(outDir, "before-after-shell-lock.png"),
            animations: "disabled",
        });
    });
});
