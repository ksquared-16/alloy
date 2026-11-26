import * as fs from "fs";
import * as path from "path";
import { test, expect } from "@playwright/test";

const mockupDir = path.join(
    __dirname,
    "../../../docs/sprints/archive/06_2026/assets/operational-intake-workspace",
);

const shots: { id: string; filename: string }[] = [
    { id: "floating-intake-card", filename: "01-floating-intake-card.png" },
    { id: "drop-zone-intake", filename: "02-drop-zone-intake.png" },
    { id: "stacked-material-cards", filename: "03-stacked-material-cards.png" },
    { id: "inbox-command-center", filename: "04-inbox-command-center.png" },
];

test.beforeAll(() => {
    fs.mkdirSync(mockupDir, { recursive: true });
});

test.describe("Operational Intake Workspace mockups", () => {
    test("capture all three-column layouts", async ({ page }) => {
        await page.setViewportSize({ width: 1600, height: 1000 });
        await page.goto("/dev/operational-intake-workspace", {
            waitUntil: "networkidle",
            timeout: 60_000,
        });
        await expect(page.getByRole("heading", { name: /Operational Intake Workspace/i })).toBeVisible({
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
