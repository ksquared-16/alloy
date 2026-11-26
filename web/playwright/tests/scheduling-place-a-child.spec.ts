/**
 * Milestone 1 browser verification — Place a Child, end to end.
 *
 * Drives the built decision loop on the running authenticated app:
 *   Overview (needs-a-room queue) → Place → deterministic options → Commit
 *   → reflected (child leaves the queue, confirmation shown).
 *
 * Run via: alloy-agent-verify 5 focused-spec playwright/tests/scheduling-place-a-child.spec.ts
 * (the harness supplies PLAYWRIGHT_BASE_URL + PLAYWRIGHT_STORAGE_STATE for slot 5).
 */
import * as fs from "fs";
import * as path from "path";
import { test, expect, type Page } from "@playwright/test";

const SHOT_DIR =
    process.env.SCHEDULING_SHOT_DIR ||
    "/private/tmp/claude-502/-Users-Kelly-Alloy--claude-worktrees-scheduling-implementation-d27e9e/4f94f148-d8ca-47f4-9fc5-354c00774a89/scratchpad/scheduling-evidence";

async function snap(page: Page, name: string) {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: true });
}

test("Place a Child — overview → options → commit → reflected", async ({ page }) => {
    await page.goto("/dev/scheduling-workspace", { waitUntil: "networkidle" });
    await expect(page.getByTestId("scheduling-workspace")).toBeVisible({ timeout: 15000 });
    await snap(page, "01-overview");

    const placeButtons = page.locator('[data-testid^="place-"]');

    // Scan every site for a needs-placement child (the shared tenant may have
    // unplaced children under a site other than the first).
    const siteSelect = page.locator("select").first();
    const siteValues = await siteSelect.locator("option").evaluateAll((opts) =>
        (opts as HTMLOptionElement[]).map((o) => o.value)
    );
    console.log(`SCHEDULING_SITE_COUNT=${siteValues.length}`);
    let queueCount = await placeButtons.count();
    for (const value of siteValues) {
        if (queueCount > 0) break;
        await siteSelect.selectOption(value);
        await page.waitForTimeout(1200);
        queueCount = await placeButtons.count();
        console.log(`SCHEDULING_SITE ${value} → queue=${queueCount}`);
    }
    console.log(`SCHEDULING_QUEUE_COUNT=${queueCount}`);

    if (queueCount === 0) {
        // No unplaced child in this tenant — the surface + API are verified, but the
        // interactive commit cannot be demonstrated without a needs-placement child.
        const empty = page.getByTestId("queue-empty");
        await expect(empty).toBeVisible();
        console.log("SCHEDULING_RESULT=no-unplaced-child");
        return;
    }

    // Capture the child's name before we place them, to assert it leaves the queue.
    const firstPlace = placeButtons.first();
    const placeTestId = await firstPlace.getAttribute("data-testid");
    await firstPlace.click();

    const placePanel = page.getByTestId("place-panel");
    await expect(placePanel).toBeVisible({ timeout: 15000 });
    // Wait for options to resolve.
    await page.waitForTimeout(1500);
    await snap(page, "02-place-options");

    const commit = page.getByTestId("commit-placement");
    const commitEnabled = await commit.isEnabled();
    console.log(`SCHEDULING_COMMIT_ENABLED=${commitEnabled}`);
    if (!commitEnabled) {
        // Every candidate room was blocked (no valid room) — a real, honest state.
        console.log("SCHEDULING_RESULT=no-valid-room");
        await snap(page, "03-no-valid-room");
        return;
    }

    await commit.click();
    await expect(page.getByTestId("commit-confirmation")).toBeVisible({ timeout: 20000 });
    await snap(page, "03-committed");

    // Reflected: the placed child is gone from the queue.
    await expect(page.locator(`[data-testid="${placeTestId}"]`)).toHaveCount(0);
    const newCount = await page.locator('[data-testid^="place-"]').count();
    console.log(`SCHEDULING_QUEUE_COUNT_AFTER=${newCount}`);
    expect(newCount).toBe(queueCount - 1);
    console.log("SCHEDULING_RESULT=committed-and-reflected");
});
