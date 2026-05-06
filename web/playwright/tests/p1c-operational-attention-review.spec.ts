import * as fs from "fs";
import * as path from "path";
import { test, expect } from "@playwright/test";

const reviewDir = path.join(__dirname, "../../../docs/sprints/05_2026/assets/p1c-review");

const shots: { id: string; filename: string }[] = [
    { id: "queue-single", filename: "queue-single.png" },
    { id: "queue-multi-factors", filename: "queue-multi-factors.png" },
    { id: "queue-wait-token", filename: "queue-wait-token.png" },
    { id: "queue-next-line", filename: "queue-next-line.png" },
    { id: "drawer-no-attention", filename: "drawer-no-attention.png" },
    { id: "drawer-single-reason", filename: "drawer-single-reason.png" },
    { id: "drawer-multi-reason", filename: "drawer-multi-reason.png" },
    { id: "drawer-expanded-factors", filename: "drawer-expanded-factors.png" },
    { id: "drawer-advanced-breakdown", filename: "drawer-advanced-breakdown.png" },
    { id: "drawer-narrow-wrap", filename: "drawer-narrow-wrap.png" },
];

test.beforeAll(() => {
    fs.mkdirSync(reviewDir, { recursive: true });
});

test.describe("P1-C operational attention fixture screenshots", () => {
    test("capture gallery sections", async ({ page }) => {
        await page.goto("/dev/p1c-operational-attention-review", { waitUntil: "networkidle", timeout: 60_000 });
        await expect(page.getByRole("heading", { name: /P1-C operational attention/i })).toBeVisible({
            timeout: 30_000,
        });

        for (const { id, filename } of shots) {
            const section = page.locator(`[data-p1c-review="${id}"]`);
            await expect(section).toBeVisible();
            await section.screenshot({
                path: path.join(reviewDir, filename),
                animations: "disabled",
            });
        }
    });
});
