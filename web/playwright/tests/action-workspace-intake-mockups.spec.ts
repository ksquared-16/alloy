import * as fs from "fs";
import * as path from "path";
import { test, expect } from "@playwright/test";

const mockupDir = path.join(
    __dirname,
    "../../../docs/sprints/archive/06_2026/assets/action-workspace-intake-mockups",
);

const shots: { id: string; filename: string }[] = [
    { id: "option-a-cohesive-environment", filename: "01-option-a-cohesive-environment.png" },
    { id: "option-b-document-workspace", filename: "02-option-b-document-workspace.png" },
    { id: "option-c-guidance-rail", filename: "03-option-c-guidance-rail.png" },
    { id: "option-d-forge-band", filename: "04-option-d-forge-band.png" },
];

test.beforeAll(() => {
    fs.mkdirSync(mockupDir, { recursive: true });
});

test.describe("Action Workspace intake experience mockups", () => {
    test("capture all layout options", async ({ page }) => {
        await page.setViewportSize({ width: 1600, height: 1000 });
        await page.goto("/dev/action-workspace-intake-mockups", {
            waitUntil: "networkidle",
            timeout: 60_000,
        });
        await expect(page.getByRole("heading", { name: /Intake Experience Mockups/i })).toBeVisible({
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
