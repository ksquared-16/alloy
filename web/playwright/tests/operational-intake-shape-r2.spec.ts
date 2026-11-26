import * as fs from "fs";
import * as path from "path";
import { test, expect } from "@playwright/test";

const mockupDir = path.join(
    __dirname,
    "../../../docs/sprints/archive/06_2026/assets/operational-intake-shape-r2",
);

const shapes = [
    "stadium-plus",
    "cloud-stadium",
    "orbital-capsule",
    "cloud-core",
    "winged-stadium",
    "superellipse",
    "forged-oval",
    "signature-bos",
] as const;

test.beforeAll(() => {
    fs.mkdirSync(mockupDir, { recursive: true });
});

test.describe("Operational Intake shape exploration R2", () => {
    test("capture all shape triples", async ({ page }) => {
        test.setTimeout(180_000);
        await page.setViewportSize({ width: 1800, height: 1000 });
        await page.goto("/dev/operational-intake-shape-r2", {
            waitUntil: "domcontentloaded",
            timeout: 90_000,
        });
        await expect(page.getByRole("heading", { name: /Signature Shell Shapes/i })).toBeVisible({
            timeout: 30_000,
        });

        for (let i = 0; i < shapes.length; i++) {
            const id = shapes[i];
            const section = page.locator(`[data-mockup="shape-r2-${id}"]`);
            await section.scrollIntoViewIfNeeded();
            await expect(section).toBeVisible();
            const filename = `${String(i + 1).padStart(2, "0")}-${id}.png`;
            await section.screenshot({
                path: path.join(mockupDir, filename),
                animations: "disabled",
            });
        }
    });
});
