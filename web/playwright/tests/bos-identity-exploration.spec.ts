import * as fs from "fs";
import * as path from "path";
import { test, expect } from "@playwright/test";

const outDir = path.join(__dirname, "../../../docs/sprints/06_2026/assets/bos-identity-exploration");

const shots: { id: string; filename: string }[] = [
    { id: "pine-first", filename: "A-pine-first-bos.png" },
    { id: "contour", filename: "B-contour-bos.png" },
    { id: "intelligence-surface", filename: "C-alloy-intelligence-surface.png" },
];

test.beforeAll(() => {
    fs.mkdirSync(outDir, { recursive: true });
});

test.describe("BOS identity exploration mockups", () => {
    test("capture three identity variants on Concept B", async ({ page }) => {
        await page.setViewportSize({ width: 1600, height: 1200 });
        await page.goto("/dev/bos-identity-exploration", { waitUntil: "networkidle", timeout: 60_000 });
        await expect(page.getByRole("heading", { name: /BOS Identity Exploration/i })).toBeVisible({
            timeout: 30_000,
        });

        for (const { id, filename } of shots) {
            const section = page.locator(`[data-identity="${id}"]`);
            await section.scrollIntoViewIfNeeded();
            await expect(section).toBeVisible();
            await section.screenshot({
                path: path.join(outDir, filename),
                animations: "disabled",
            });
        }
    });
});
