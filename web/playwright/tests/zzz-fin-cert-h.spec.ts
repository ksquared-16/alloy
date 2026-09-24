import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/final-mounted";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
test("§14 — automatic periodic billing is productized and active", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    expect(page.url()).not.toContain("/login");
    await page.locator("[data-adminv2-sidebar-modal-nav='financials']").first().click({ force: true, timeout: 20_000 });
    await page.waitForTimeout(12_000);
    const found: Record<string, unknown>[] = [];
    mkdirSync(OUT, { recursive: true });
    for (const tab of ["overview", "charges", "payments"]) {
        const t = page.locator(`[data-workspace-section-tab='${tab}']`).first();
        if (!(await t.count())) { found.push({ tab, present: false }); continue; }
        await t.click({ timeout: 20_000 });
        await page.waitForTimeout(9000);
        const r = await page.evaluate(() => {
            const text = document.body.innerText;
            const hit = (re: RegExp) => { const m = text.match(re); return m ? m[0].slice(0, 160) : null; };
            return {
                periodic: hit(/[^\n]*periodic[^\n]*/i),
                recurring: hit(/[^\n]*recurring[^\n]*/i),
                automatic: hit(/[^\n]*automatic[^\n]*/i),
                billingRun: hit(/[^\n]*billing run[^\n]*/i),
                tuitionSchedule: hit(/[^\n]*schedule[^\n]*/i),
                nextBilling: hit(/[^\n]*next[^\n]*bill[^\n]*/i),
            };
        });
        log(`§14 TAB ${tab} ${JSON.stringify(r)}`);
        found.push({ tab, ...r });
        await page.screenshot({ path: `${OUT}/G-${tab}.png` });
    }
    writeFileSync(`${OUT}/G-periodic-billing.json`, JSON.stringify(found, null, 2));
});
