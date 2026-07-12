import * as fs from "fs";
import * as path from "path";
import { test, expect } from "@playwright/test";

const reviewDir = path.join(__dirname, "../../../docs/sprints/archive/06_2026/assets/action-workspace-review");

const shots: { id: string; filename: string }[] = [
    { id: "bos-intake", filename: "01-bos-intake.png" },
    { id: "bos-suggestions", filename: "02-bos-suggestions.png" },
    { id: "gather-details", filename: "03-gather-details.png" },
    { id: "review", filename: "04-review.png" },
    { id: "execute", filename: "05-execute.png" },
    { id: "success", filename: "06-success.png" },
];

test.beforeAll(() => {
    fs.mkdirSync(reviewDir, { recursive: true });
});

test.describe("Action Workspace Create Lead screenshots", () => {
    test("capture all step fixtures", async ({ page }) => {
        await page.setViewportSize({ width: 1600, height: 1000 });
        await page.goto("/dev/action-workspace-review", { waitUntil: "networkidle", timeout: 60_000 });
        await expect(page.getByRole("heading", { name: /Action Workspace V1\.1/i })).toBeVisible({
            timeout: 30_000,
        });

        for (const { id, filename } of shots) {
            const section = page.locator(`[data-action-workspace-review="${id}"]`);
            await section.scrollIntoViewIfNeeded();
            await expect(section).toBeVisible();
            await section.screenshot({
                path: path.join(reviewDir, filename),
                animations: "disabled",
            });
        }
    });
});
