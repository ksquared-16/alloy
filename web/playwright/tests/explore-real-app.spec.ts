import * as fs from "fs";
import * as path from "path";
import { test, type Page } from "@playwright/test";

const SHOT_DIR =
    "/private/tmp/claude-502/-Users-Kelly-Alloy--claude-worktrees-scheduling-implementation-d27e9e/9d77ce54-a385-4bc8-8ebc-863bad78f84d/scratchpad/explore";

async function snap(page: Page, name: string) {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: true });
}

test("propose a schedule for a pre-enrolled Kurzman child", async ({ page }) => {
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
    await page.waitForTimeout(6000); // options + billing

    // Set effective start, then Save.
    const dateInput = page.locator('[data-schedule-surface="true"] input[type="date"]').first();
    await dateInput.fill("2026-08-04");
    await page.waitForTimeout(800);
    const commit = page.locator('[data-schedule-commit="true"]').first();
    console.log("SAVE_ENABLED=" + (await commit.isEnabled()));
    await commit.click({ force: true });
    await page.waitForTimeout(4500);

    const cardText = await page.locator('[data-scheduling-card="true"]').first().innerText().catch(() => "");
    console.log("RESULT_TEXT=" + JSON.stringify(cardText.replace(/\n+/g, " | ").slice(0, 200)));
    await snap(page, "80-proposed-result");
    console.log("PAGE_ERRORS=" + JSON.stringify([...new Set(errors)].slice(0, 5)));
});
