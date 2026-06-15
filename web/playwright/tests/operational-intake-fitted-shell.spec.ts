import * as fs from "fs";
import * as path from "path";
import { test, expect } from "@playwright/test";

const mockupDir = path.join(
    __dirname,
    "../../../docs/sprints/06_2026/assets/operational-intake-fitted-shell",
);

const shots: { id: string; filename: string }[] = [
    { id: "fitted-stadium", filename: "01-stadium-shell.png" },
    { id: "fitted-hybrid", filename: "02-hybrid-oval-trapezoid-shell.png" },
    { id: "fitted-trapezoid", filename: "03-soft-trapezoid-shell.png" },
];

test.beforeAll(() => {
    fs.mkdirSync(mockupDir, { recursive: true });
});

test.describe("Operational Intake fitted signature shells", () => {
    test("capture all fitted shell mockups", async ({ page }) => {
        test.setTimeout(120_000);
        await page.setViewportSize({ width: 1600, height: 1000 });
        await page.goto("/dev/operational-intake-fitted-shell", {
            waitUntil: "domcontentloaded",
            timeout: 90_000,
        });
        await expect(page.getByRole("heading", { name: /Fitted Signature Shell/i })).toBeVisible({
            timeout: 30_000,
        });

        for (const { id, filename } of shots) {
            const section = page.locator(`[data-mockup="${id}"]`);
            await section.scrollIntoViewIfNeeded();
            await expect(section).toBeVisible();
            await section.screenshot({
                path: path.join(mockupDir, filename),
                animations: "disabled",
            });
        }
    });
});
