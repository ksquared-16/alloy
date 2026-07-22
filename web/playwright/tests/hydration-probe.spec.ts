/**
 * Isolation probe (not a product test) — does the New Leads workspace emit a
 * hydration warning on reload independent of any Scheduling interaction?
 */
import { test } from "@playwright/test";

test("reload new-leads + open Kurzman, no scheduling interaction", async ({ page }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 120)));

    for (let i = 0; i < 2; i++) {
        await page.goto("/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(6000);
        await page.getByText("Kurzman Family", { exact: false }).first().click();
        await page.waitForTimeout(9000);
        console.log(`PASS_${i}_ERRORS=` + JSON.stringify([...new Set(errors)]));
    }
    console.log("TOTAL_ERRORS=" + JSON.stringify([...new Set(errors)].slice(0, 6)));
});
