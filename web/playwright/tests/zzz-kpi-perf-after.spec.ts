/** Details timing after the convergence — three samples, same method as the before-measurement. */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/kpi-parity-proof";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(1_500_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const runs: Record<string, number>[] = [];
async function sample(page: Page) {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-financials-nav='details']").first()).toHaveCount(1, { timeout: 150_000 });
    const d0 = Date.now();
    await page.locator("[data-financials-nav='details']").first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-detail='true']")).toHaveCount(1, { timeout: 120_000 });
    const shellAt = Date.now() - d0;
    await page.waitForFunction(() => document.querySelectorAll("[data-financials-ledger-row]").length > 0, undefined, { timeout: 150_000 }).catch(() => undefined);
    const ledgerAt = Date.now() - d0;
    const rows = await page.evaluate(() => document.querySelectorAll("[data-financials-ledger-row]").length);
    const r = { shellAt, ledgerAt, rows };
    log(`SAMPLE ${JSON.stringify(r)}`);
    runs.push(r);
}
for (const n of [1, 2, 3]) test(`sample ${n}`, async ({ page }) => { await sample(page); });
test("record", async () => {
    const med = (k: string) => { const v = runs.map((r) => r[k]!).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
    const out = { samples: runs, medianShellMs: med("shellAt"), medianLedgerMs: med("ledgerAt"), rows: runs[0]!.rows };
    log(`AFTER-REPAIR TIMING ${JSON.stringify(out)}`);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/perf-after.json`, JSON.stringify(out, null, 2));
    expect(runs.length).toBe(3);
});
