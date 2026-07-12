import * as fs from "fs";
import * as path from "path";
import { test, expect } from "@playwright/test";

const mockupDir = path.join(
    __dirname,
    "../../../docs/sprints/archive/06_2026/assets/operational-intake-silhouette",
);

const shots: { id: string; filename: string }[] = [
    { id: "silhouette-carved-workspace", filename: "01-carved-workspace.png" },
    { id: "silhouette-command-well", filename: "02-command-well.png" },
    { id: "silhouette-floating-stack", filename: "03-floating-material-stack.png" },
    { id: "silhouette-cloud-perimeter", filename: "04-cloud-perimeter.png" },
];

test.beforeAll(() => {
    fs.mkdirSync(mockupDir, { recursive: true });
});

test.describe("Operational Intake silhouette mockups", () => {
    test("capture all workspace geometries", async ({ page }) => {
        await page.setViewportSize({ width: 1600, height: 1000 });
        await page.goto("/dev/operational-intake-silhouette", {
            waitUntil: "networkidle",
            timeout: 60_000,
        });
        await expect(page.getByRole("heading", { name: /Silhouette/i })).toBeVisible({
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
