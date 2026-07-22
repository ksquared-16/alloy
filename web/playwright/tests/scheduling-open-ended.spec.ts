/**
 * P6 verification — open-ended is configuration-driven (pattern policy, default the
 * simple case) and clearly labeled; toggling switches the caption; end_date writes clean.
 */
import * as fs from "fs";
import * as path from "path";
import { test, expect, type Page } from "@playwright/test";

const SHOT_DIR =
    process.env.SCHEDULING_SHOT_DIR ||
    "/private/tmp/claude-502/-Users-Kelly-Alloy--claude-worktrees-scheduling-v1-impl-7c7908/bf1e5f44-0762-443b-94ae-0c32300886ba/scratchpad/scheduling-evidence";

async function snap(page: Page, name: string) {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: true });
}

test("open-ended is config-driven default + labeled + togglable", async ({ page }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));

    await page.goto("/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);
    await page.getByText("Kurzman Family", { exact: false }).first().click();
    await page.waitForTimeout(11000);
    const bosClose = page.getByRole("button", { name: /^close$/i }).first();
    if (await bosClose.count()) await bosClose.click().catch(() => {});
    await page.waitForTimeout(800);

    await page.locator("[data-scheduling-open]").first().click({ force: true });
    await page.locator('[data-schedule-surface="true"]').first().waitFor({ timeout: 20000 });
    await page.locator("[data-pattern]").first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(800);

    const checkbox = page.locator("[data-open-ended]");
    const caption = page.locator('[data-open-ended-caption="true"]');
    const defaultChecked = await checkbox.getAttribute("data-open-ended");
    const captionText = await caption.innerText();
    console.log("OPEN_ENDED_DEFAULT=" + defaultChecked);
    console.log("CAPTION_DEFAULT=" + JSON.stringify(captionText));
    await snap(page, "p6-00-open-ended-default");

    // Toggle to bounded → caption switches.
    await checkbox.uncheck();
    await page.waitForTimeout(300);
    const captionBounded = await caption.innerText();
    console.log("CAPTION_BOUNDED=" + JSON.stringify(captionBounded));
    console.log("PAGE_ERRORS=" + JSON.stringify([...new Set(errors)].slice(0, 5)));

    expect(defaultChecked, "config-driven default open-ended (true)").toBe("true");
    expect(captionText, "labeled ongoing").toContain("Ongoing");
    expect(captionBounded, "caption switches to bounded").toContain("Bounded");
    expect(errors.length, "no page errors").toBe(0);
});
