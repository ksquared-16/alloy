import * as fs from "fs";
import * as path from "path";
import { test, expect } from "@playwright/test";

const mockupDir = path.join(
    __dirname,
    "../../../docs/sprints/archive/06_2026/assets/operational-intake-workstation",
);

const shots: { id: string; filename: string }[] = [
    { id: "archetype-trapezoid", filename: "01-trapezoid-workstation.png" },
    { id: "archetype-flight-deck", filename: "02-flight-deck-workstation.png" },
    { id: "archetype-harbor", filename: "03-harbor-docking-workstation.png" },
    { id: "archetype-cloud-core", filename: "04-cloud-core-workstation.png" },
];

test.beforeAll(() => {
    fs.mkdirSync(mockupDir, { recursive: true });
});

test.describe("Operational Intake workstation archetypes", () => {
    test("capture all archetype layouts", async ({ page }) => {
        test.setTimeout(120_000);
        await page.setViewportSize({ width: 1600, height: 1000 });
        await page.goto("/dev/operational-intake-workstation", {
            waitUntil: "domcontentloaded",
            timeout: 90_000,
        });
        await expect(page.getByRole("heading", { name: /Operational Intake Workstation/i })).toBeVisible({
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
