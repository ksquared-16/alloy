import { test, expect } from "@playwright/test";

test.describe("Queue record doctrine visual review", () => {
    test("renders horizontal operational row in production card shell", async ({ page }) => {
        await page.goto("/dev/queue-record-doctrine-review", { waitUntil: "networkidle", timeout: 60_000 });
        await expect(page.getByRole("heading", { name: /Queue record doctrine/i })).toBeVisible({ timeout: 30_000 });

        const row = page.locator('[data-queue-record-layout="operational-row"]');
        await expect(row).toBeVisible();

        const content = page.locator(".operational-queue-row__content");
        const display = await content.evaluate((el) => getComputedStyle(el).display);
        expect(display).toBe("grid");

        await expect(page.locator(".queue-record-field--title")).toContainText("Johnson Family");
        await expect(page.locator(".queue-record-field--pill")).toBeVisible();
        await expect(page.locator(".queue-record-field--attention")).toBeVisible();
        const tasks = page.locator(".queue-record-widget--tasks");
        await expect(tasks).toBeVisible();
        await expect(tasks.locator(".queue-record-widget__task-title").first()).toContainText("Follow up");
        await expect(page.locator('[data-queue-children-overflow="true"]')).toContainText("+1 more");
        await expect(page.locator(".operational-queue-row__action-rail")).toBeVisible();
        await expect(page.locator('[data-queue-row-bos-button="true"]')).toBeVisible();

        const section = page.locator('[data-doctrine-review="enrollment-row"]');
        const columns = page.locator(".operational-queue-row__content > .operational-queue-row__column--scoped");
        await expect(columns).toHaveCount(5);
        const box = await columns.first().boundingBox();
        const boxLast = await columns.nth(4).boundingBox();
        expect(box && boxLast).toBeTruthy();
        if (box && boxLast) {
            expect(boxLast.x).toBeGreaterThan(box.x);
        }
    });
});
