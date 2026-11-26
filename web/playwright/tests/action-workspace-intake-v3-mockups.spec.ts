import * as fs from "fs";
import * as path from "path";
import { test, expect } from "@playwright/test";

const mockupDir = path.join(
    __dirname,
    "../../../docs/sprints/archive/06_2026/assets/action-workspace-intake-v3-mockups",
);

const shots: { id: string; filename: string }[] = [
    { id: "concept-a-inbox", filename: "01-concept-a-inbox.png" },
    { id: "concept-b-intake-tray", filename: "02-concept-b-intake-tray.png" },
    { id: "concept-c-conversation", filename: "03-concept-c-conversation.png" },
    { id: "concept-d-drop-zone", filename: "04-concept-d-drop-zone.png" },
];

test.beforeAll(() => {
    fs.mkdirSync(mockupDir, { recursive: true });
});

test.describe("Action Workspace V3 intake interaction mockups", () => {
    test("capture all concept states", async ({ page }) => {
        await page.setViewportSize({ width: 1600, height: 1000 });
        await page.goto("/dev/action-workspace-intake-v3-mockups", {
            waitUntil: "networkidle",
            timeout: 60_000,
        });
        await expect(page.getByRole("heading", { name: /Abandon The Form/i })).toBeVisible({
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
