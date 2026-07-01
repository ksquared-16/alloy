import * as fs from "fs";
import * as path from "path";
import { test, expect } from "@playwright/test";

const outDir = path.join(__dirname, "../../../docs/sprints/06_2026/assets/bos-atmospheric-border-exploration");

const shots: { id: string; filename: string }[] = [
    { id: "soft-intelligence-field", filename: "A-soft-intelligence-field.png" },
    { id: "brainwave-border", filename: "B-brainwave-border.png" },
    { id: "cloud-energy-border", filename: "C-cloud-energy-border.png" },
];

test.beforeAll(() => {
    fs.mkdirSync(outDir, { recursive: true });
});

test.describe("BOS atmospheric border explorations", () => {
    test("capture three atmospheric variants", async ({ page }) => {
        await page.setViewportSize({ width: 1600, height: 1300 });
        await page.goto("/dev/bos-atmospheric-border-exploration", {
            waitUntil: "networkidle",
            timeout: 60_000,
        });
        await expect(page.getByRole("heading", { name: /BOS territory/i })).toBeVisible({ timeout: 30_000 });

        for (const { id, filename } of shots) {
            const section = page.locator(`[data-atmospheric-border="${id}"]`);
            await section.scrollIntoViewIfNeeded();
            await expect(section).toBeVisible();
            await section.screenshot({
                path: path.join(outDir, filename),
                animations: "disabled",
            });
        }
    });
});
