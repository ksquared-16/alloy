import * as fs from "fs";
import * as path from "path";
import { test, expect } from "@playwright/test";

const outDir = path.join(__dirname, "../../../docs/sprints/06_2026/assets/bos-workspace-shell-exploration");

const shells: { id: string; filename: string }[] = [
    { id: "cloud", filename: "01-cloud-shell.png" },
    { id: "organic-contour", filename: "02-organic-contour-shell.png" },
    { id: "intelligence-halo", filename: "03-intelligence-halo-shell.png" },
    { id: "sculpted-alloy", filename: "04-sculpted-alloy-shell.png" },
    { id: "dynamic-island", filename: "05-dynamic-island-shell.png" },
];

test.beforeAll(() => {
    fs.mkdirSync(outDir, { recursive: true });
});

test.describe("BOS workspace shell explorations", () => {
    test("capture five shell variants closed and open", async ({ page }) => {
        await page.setViewportSize({ width: 1600, height: 1400 });
        await page.goto("/dev/bos-workspace-shell-exploration", {
            waitUntil: "networkidle",
            timeout: 60_000,
        });
        await expect(page.getByRole("heading", { name: /Entering BOS territory/i })).toBeVisible({
            timeout: 30_000,
        });

        for (const { id, filename } of shells) {
            const section = page.locator(`[data-workspace-shell="${id}"]`);
            await section.scrollIntoViewIfNeeded();
            await expect(section).toBeVisible();
            await section.screenshot({
                path: path.join(outDir, filename),
                animations: "disabled",
            });
        }
    });
});
