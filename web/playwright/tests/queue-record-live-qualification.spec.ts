import { test, expect } from "@playwright/test";

/**
 * Live work-unit queue row doctrine QA — Qualification lane.
 * Requires an authenticated admin session in the browser context.
 * Run locally: PLAYWRIGHT_LIVE_QUEUE_AUDIT=1 npx playwright test queue-record-live-qualification
 */
const LIVE_AUDIT_ENABLED = process.env.PLAYWRIGHT_LIVE_QUEUE_AUDIT === "1";
const ENROLLMENT_DEPT_ID = "04958a78-32ca-4091-bcd3-4bbaef3fee4b";
const QUALIFICATION_WU_ID = "a428520f-b6a1-4913-8209-2d45a9affcd9";

test.describe("Live Qualification queue row doctrine", () => {
    test.skip(!LIVE_AUDIT_ENABLED, "Set PLAYWRIGHT_LIVE_QUEUE_AUDIT=1 to run live lane audit");

    test("operational row renders doctrine widgets on work-unit queue", async ({ page }) => {
        const url = `/adminV2/workspace/dept/${ENROLLMENT_DEPT_ID}/work-unit/${QUALIFICATION_WU_ID}`;
        await page.goto(url, { waitUntil: "networkidle", timeout: 90_000 });

        const row = page.locator('[data-queue-row-runtime-path="layout-runtime-queue-row-view"]').first();
        await expect(row).toBeVisible({ timeout: 45_000 });

        const shell = row.locator(".operational-queue-row-shell").first();
        await expect(shell).toBeVisible();

        const childrenMax = await shell.getAttribute("data-queue-children-max-items");
        expect(childrenMax).toBe("5");

        await expect(shell.locator(".queue-record-field--primary-contact").first()).toBeVisible();
        await expect(shell.locator(".queue-record-field--pill").first()).toBeVisible();

        const tasks = shell.locator(".queue-record-widget--tasks").first();
        await expect(tasks).toBeVisible();
        await expect(tasks.locator(".queue-record-widget__task-title").first()).toBeVisible();

        const childList = shell.locator(".operational-queue-row__child-list").first();
        if (await childList.count()) {
            await expect(childList.locator("[data-queue-child-row]").first()).toBeVisible();
        }

        const pill = shell.locator(".queue-record-field--pill").first();
        const pillRadius = await pill.evaluate((el) => getComputedStyle(el).borderRadius);
        expect(parseFloat(pillRadius)).toBeGreaterThan(8);

        const primarySize = await shell
            .locator(".queue-record-field--primary-contact .queue-record-field__text")
            .first()
            .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
        const phoneSize = await shell
            .locator(".queue-record-field--contact-secondary .queue-record-field__text")
            .first()
            .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
        expect(primarySize).toBeGreaterThan(phoneSize);
    });
});
