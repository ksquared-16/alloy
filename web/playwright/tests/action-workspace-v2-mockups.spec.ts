import * as fs from "fs";
import * as path from "path";
import { test, expect } from "@playwright/test";

const mockupDir = path.join(__dirname, "../../../docs/sprints/archive/06_2026/assets/action-workspace-v2-mockups");

const shots: { id: string; filename: string }[] = [
    { id: "intake", filename: "01-intake.png" },
    { id: "findings", filename: "02-findings.png" },
    { id: "fill-gaps", filename: "03-fill-gaps.png" },
    { id: "ready-to-create", filename: "04-ready-to-create.png" },
];

test.beforeAll(() => {
    fs.mkdirSync(mockupDir, { recursive: true });
});

test.describe("Action Workspace V2 Concept B+ mockups", () => {
    test("capture all design states", async ({ page }) => {
        await page.setViewportSize({ width: 1600, height: 1000 });
        await page.goto("/dev/action-workspace-v2-mockups", { waitUntil: "networkidle", timeout: 60_000 });
        await expect(page.getByRole("heading", { name: /Action Workspace V2/i })).toBeVisible({
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
