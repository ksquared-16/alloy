import * as fs from "fs";
import * as path from "path";
import { test, expect } from "@playwright/test";

const outDir = path.join(__dirname, "../../../docs/sprints/archive/06_2026/assets/bos-shape-exploration");

const shots: { id: string; filename: string }[] = [
    { id: "cloud", filename: "A-cloud-bos.png" },
    { id: "contour", filename: "B-contour-bos.png" },
    { id: "halo", filename: "C-halo-bos.png" },
    { id: "intelligence-frame", filename: "D-intelligence-frame-bos.png" },
];

test.beforeAll(() => {
    fs.mkdirSync(outDir, { recursive: true });
});

test.describe("BOS shape identity explorations", () => {
    test("capture four shape variants on Concept B", async ({ page }) => {
        await page.setViewportSize({ width: 1600, height: 1100 });
        await page.goto("/dev/bos-shape-exploration", { waitUntil: "networkidle", timeout: 60_000 });
        await expect(page.getByRole("heading", { name: /What does BOS look like/i })).toBeVisible({
            timeout: 30_000,
        });

        for (const { id, filename } of shots) {
            const section = page.locator(`[data-bos-shape="${id}"]`);
            await section.scrollIntoViewIfNeeded();
            await expect(section).toBeVisible();
            await section.screenshot({
                path: path.join(outDir, filename),
                animations: "disabled",
            });
        }
    });
});
