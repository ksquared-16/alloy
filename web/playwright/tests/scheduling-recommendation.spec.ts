/**
 * P5 verification — the recommended room reason reflects the refined policy
 * (program/age eligibility · continuity · headroom), not headroom alone. The
 * reason must be one of the policy-driven phrases and render with 0 page errors.
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

test("recommended room reason is policy-driven (program/continuity/headroom)", async ({ page }) => {
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
    // Let the option generator run over the real rooms.
    await page.locator('[data-room-reason="recommended"]').first().waitFor({ timeout: 20000 });

    const reason = (await page.locator('[data-room-reason="recommended"]').first().innerText()).trim();
    console.log("RECOMMENDED_REASON=" + JSON.stringify(reason));
    console.log("PAGE_ERRORS=" + JSON.stringify([...new Set(errors)].slice(0, 5)));
    await snap(page, "p5-recommendation");

    const policyPhrases = ["Right room for the program", "Keeps continuity", "Most headroom"];
    expect(policyPhrases.some((p) => reason.includes(p)), `reason is policy-driven: ${reason}`).toBeTruthy();
    expect(errors.length, "no page errors").toBe(0);
});
