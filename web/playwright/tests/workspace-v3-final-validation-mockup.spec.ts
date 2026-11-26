import * as fs from "fs";
import * as path from "path";
import { test } from "@playwright/test";

const outDir = path.join(
    __dirname,
    "../../../docs/sprints/archive/06_2026/workspace-v3-operational-command-center/mockups/final-validation",
);

test.beforeAll(() => {
    fs.mkdirSync(outDir, { recursive: true });
});

test.describe("Workspace V3 final validation mockups", () => {
    test("captures enrollment operational surface evolution mockup", async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 960 });
        await page.goto(
            `file://${path.join(outDir, "enrollment-operational-surface-evolution.html")}`,
            { waitUntil: "load" },
        );
        await page.waitForTimeout(500);
        await page.screenshot({
            path: path.join(outDir, "01-enrollment-operational-surface-evolution.png"),
            fullPage: false,
            animations: "disabled",
        });
    });

    test("captures continuity depth flow diagram", async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 720 });
        await page.goto(`file://${path.join(outDir, "continuity-depth-flow.html")}`, {
            waitUntil: "load",
        });
        await page.waitForTimeout(300);
        await page.screenshot({
            path: path.join(outDir, "02-continuity-depth-flow.png"),
            fullPage: false,
            animations: "disabled",
        });
    });
});
