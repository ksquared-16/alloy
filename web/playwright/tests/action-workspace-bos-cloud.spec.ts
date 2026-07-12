import * as fs from "fs";
import * as path from "path";
import { test, expect } from "@playwright/test";

const outDir = path.join(__dirname, "../../../docs/sprints/archive/06_2026/assets/action-workspace-bos-cloud");

const shots: { id: string; filename: string }[] = [
    { id: "initial-choice", filename: "01-initial-choice.png" },
    { id: "paste-analyze", filename: "02-paste-analyze.png" },
    { id: "bos-findings", filename: "03-bos-findings.png" },
    { id: "manual-entry", filename: "04-manual-entry.png" },
    { id: "execute", filename: "05-execute.png" },
    { id: "success", filename: "06-success.png" },
];

test.beforeAll(() => {
    fs.mkdirSync(outDir, { recursive: true });
});

test.describe("Create Lead BOS cloud modal screenshots", () => {
    test("capture all states", async ({ page }) => {
        test.setTimeout(120_000);
        await page.setViewportSize({ width: 1600, height: 1100 });
        await page.goto("/dev/action-workspace-bos-cloud", { waitUntil: "load", timeout: 60_000 });
        await expect(page.getByRole("heading", { name: /BOS Workspace Shell/i })).toBeVisible({ timeout: 30_000 });

        for (const { id, filename } of shots) {
            const section = page.locator(`[data-bos-cloud-shot="${id}"]`);
            await section.scrollIntoViewIfNeeded();
            await expect(section).toBeVisible();
            await section.screenshot({ path: path.join(outDir, filename), animations: "disabled" });
        }
    });
});
