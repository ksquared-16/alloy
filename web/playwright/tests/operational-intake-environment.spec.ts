import * as fs from "fs";
import * as path from "path";
import { test, expect } from "@playwright/test";

const mockupDir = path.join(
    __dirname,
    "../../../docs/sprints/archive/06_2026/assets/operational-intake-environment",
);

const shots: { id: string; filename: string }[] = [
    { id: "env-oval-command-table", filename: "01-oval-command-table.png" },
    { id: "env-arena", filename: "02-arena.png" },
    { id: "env-forge", filename: "03-forge.png" },
    { id: "env-observatory", filename: "04-observatory.png" },
];

test.beforeAll(() => {
    fs.mkdirSync(mockupDir, { recursive: true });
});

test.describe("Operational Intake environmental objects", () => {
    test("capture all object mockups", async ({ page }) => {
        test.setTimeout(120_000);
        await page.setViewportSize({ width: 1600, height: 1000 });
        await page.goto("/dev/operational-intake-environment", {
            waitUntil: "domcontentloaded",
            timeout: 90_000,
        });
        await expect(page.getByRole("heading", { name: /Environmental Objects/i })).toBeVisible({
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
