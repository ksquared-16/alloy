import * as fs from "fs";
import * as path from "path";
import { test, expect } from "@playwright/test";

const mockupDir = path.join(
    __dirname,
    "../../../docs/sprints/06_2026/assets/operational-intake-geometry",
);

const shots: { id: string; filename: string }[] = [
    { id: "geometry-superellipse", filename: "01-superellipse.png" },
    { id: "geometry-oval", filename: "02-oval.png" },
    { id: "geometry-stadium", filename: "03-stadium.png" },
    { id: "geometry-soft-trapezoid", filename: "04-soft-trapezoid.png" },
    { id: "geometry-offset-capsule", filename: "05-offset-capsule.png" },
    { id: "geometry-hybrid", filename: "06-hybrid-oval-trapezoid.png" },
];

test.beforeAll(() => {
    fs.mkdirSync(mockupDir, { recursive: true });
});

test.describe("Operational Intake geometry V2", () => {
    test("capture all silhouette mockups", async ({ page }) => {
        test.setTimeout(120_000);
        await page.setViewportSize({ width: 1600, height: 1000 });
        await page.goto("/dev/operational-intake-geometry", {
            waitUntil: "domcontentloaded",
            timeout: 90_000,
        });
        await expect(page.getByRole("heading", { name: /Geometry Exploration V2/i })).toBeVisible({
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
