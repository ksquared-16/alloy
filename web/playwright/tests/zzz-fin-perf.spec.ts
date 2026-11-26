/** CURRENT deployed Financials performance. Measured now; no stale numbers reused. */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/runtime-unblock";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(1_800_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const runs: Record<string, unknown>[] = [];

async function measure(page: Page, pass: string) {
    const t0 = Date.now();
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    const domAt = Date.now() - t0;
    /* SHELL: the card's reserved geometry exists. */
    await page.locator("[data-financials-card='true']").first().waitFor({ timeout: 150_000 }).catch(() => undefined);
    const shellAt = Date.now() - t0;
    /* FIRST AUTHORITATIVE MEANING: a real money value on the card. */
    await page.waitForFunction(() => {
        const c = document.querySelector("[data-financials-card='true']") as HTMLElement | null;
        return !!c && /\$[\d,]+\.\d{2}/.test(c.innerText || "");
    }, undefined, { timeout: 150_000 }).catch(() => undefined);
    const meaningAt = Date.now() - t0;
    /* ACTIONABLE: the operator can act — Details / Payment / Add are live. */
    await page.locator("[data-financials-nav='details']").first().waitFor({ timeout: 150_000 }).catch(() => undefined);
    const actionableAt = Date.now() - t0;
    /* SETTLED: the diagnostic says the patch was applied. */
    await page.waitForFunction(() => {
        const w = window as unknown as { __ALLOY_SETTLEMENT_DIAG__?: Array<{ outcome?: string }> };
        return (w.__ALLOY_SETTLEMENT_DIAG__ ?? []).some((e) => e.outcome === "applied");
    }, undefined, { timeout: 150_000 }).catch(() => undefined);
    const settledAt = Date.now() - t0;

    /* DETAILS INTERACTION: click to canonical inner product. */
    const d0 = Date.now();
    await page.locator("[data-financials-nav='details']").first().click({ timeout: 20_000 }).catch(() => undefined);
    await page.locator("[data-financials-detail='true']").first().waitFor({ timeout: 150_000 }).catch(() => undefined);
    const detailShellAt = Date.now() - d0;
    await page.waitForFunction(() => (document.querySelectorAll("[data-financials-ledger-row]").length > 0), undefined, { timeout: 150_000 }).catch(() => undefined);
    const detailLedgerAt = Date.now() - d0;

    const r = { pass, domAt, shellAt, meaningAt, actionableAt, settledAt, detailShellAt, detailLedgerAt };
    log(`PERF ${JSON.stringify(r)}`);
    runs.push(r);
}

test("cold pass", async ({ page }) => { await measure(page, "cold"); });
test("warm pass 1", async ({ page }) => { await measure(page, "warm-1"); });
test("warm pass 2", async ({ page }) => { await measure(page, "warm-2"); });
test("record", async () => {
    const warm = runs.filter((r) => String(r.pass).startsWith("warm"));
    const med = (k: string, set: Record<string, unknown>[]) => {
        const v = set.map((r) => Number(r[k])).sort((a, b) => a - b);
        return v.length ? v[Math.floor(v.length / 2)] : null;
    };
    const summary = {
        cold: runs.find((r) => r.pass === "cold") ?? null,
        warmMedian: Object.fromEntries(["domAt", "shellAt", "meaningAt", "actionableAt", "settledAt", "detailShellAt", "detailLedgerAt"].map((k) => [k, med(k, warm)])),
        all: runs,
    };
    log(`PERF SUMMARY ${JSON.stringify(summary, null, 1)}`);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/perf.json`, JSON.stringify(summary, null, 2));
    expect(runs.length).toBe(3);
});
