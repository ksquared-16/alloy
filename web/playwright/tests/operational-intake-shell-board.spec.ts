import * as fs from "fs";
import * as path from "path";
import { test, expect } from "@playwright/test";

const mockupDir = path.join(
    __dirname,
    "../../../docs/sprints/06_2026/assets/operational-intake-shell-board",
);

test.beforeAll(() => {
    fs.mkdirSync(mockupDir, { recursive: true });
});

test.describe("Operational Intake shell comparison board", () => {
    test("capture single comparison board", async ({ page }) => {
        test.setTimeout(120_000);
        await page.setViewportSize({ width: 1920, height: 1200 });
        await page.goto("/dev/operational-intake-shell-board", {
            waitUntil: "domcontentloaded",
            timeout: 90_000,
        });
        await expect(page.getByRole("heading", { name: /Shell Comparison Board/i })).toBeVisible({
            timeout: 30_000,
        });

        const board = page.locator('[data-mockup="shell-comparison-board"]');
        await expect(board).toBeVisible();
        await board.screenshot({
            path: path.join(mockupDir, "shell-comparison-board.png"),
            animations: "disabled",
        });
    });
});
