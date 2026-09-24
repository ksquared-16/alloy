/** MOUNTED PROOF — the same Certhouse account, six KPIs, both hosts. Read only. */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/kpi-parity-proof";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(1_500_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const save = (n: string, v: unknown) => { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/${n}.json`, JSON.stringify(v, null, 2)); };
const shot = async (p: Page, n: string) => { mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: `${OUT}/${n}.png` }); };

/** The inner product only — outer host chrome excluded. */
const INNER = () => {
    const root = document.querySelector("[data-financials-detail='true']") as HTMLElement | null;
    if (!root) return { present: false } as Record<string, unknown>;
    const q = (s: string) => root.querySelectorAll(s).length;
    const t = (s: string) => { const e = root.querySelector(s) as HTMLElement | null; return e ? e.innerText.replace(/\s+/g, " ").trim() : null; };
    const txt = root.innerText.replace(/\s+/g, " ");
    const kpi = (l: string) => { const m = txt.match(new RegExp(l + "\\s*(-?\\$[\\d,]+\\.\\d{2}|None)")); return m ? m[1] : "ABSENT"; };
    const scopeBtn = Array.from(root.querySelectorAll("button")).find((b) => /Everyone|Certa Certhouse|Certb Certhouse|Household/.test((b.textContent || "").trim()));
    return {
        present: true,
        kpis: {
            "CURRENT BALANCE": kpi("CURRENT BALANCE"), "DUE": kpi("DUE"), "PAST DUE": kpi("PAST DUE"),
            "RESPONSIBILITY": kpi("RESPONSIBILITY"), "PAID": kpi("PAID"), "AVAILABLE PREPAID": kpi("AVAILABLE PREPAID"),
        },
        scopeControl: scopeBtn ? (scopeBtn.textContent || "").replace(/\s+/g, " ").trim() : null,
        relationshipRow: t("[data-financials-payer-row='true']"),
        rowGroups: q("[data-financials-row-group]"),
        discountSummary: t("[data-financials-discount-summary='true']"),
        discountGear: q("[data-financials-manage-discounts='gear']"),
        methodState: t("[data-financials-method-state='true']"),
        managePayments: q("[data-financials-manage-payments='open']"),
        responsibilityGear: q("[data-financials-manage-responsibility='gear']"),
        responsibleFilter: q("[data-testid='financials-filter-responsible-party']"),
        lenses: t("[data-financials-lenses='true']"),
        ledgerRows: q("[data-financials-ledger-row]"),
        periodHeaders: q("[data-financials-period]"),
        actions: q("[data-financials-actions='true']"),
    };
};
async function focusDetails(page: Page) {
    const t0 = Date.now();
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-financials-nav='details']").first()).toHaveCount(1, { timeout: 150_000 });
    const d0 = Date.now();
    await page.locator("[data-financials-nav='details']").first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-detail='true']")).toHaveCount(1, { timeout: 120_000 });
    const shellAt = Date.now() - d0;
    await page.waitForFunction(() => document.querySelectorAll("[data-financials-ledger-row]").length > 0, undefined, { timeout: 150_000 }).catch(() => undefined);
    const ledgerAt = Date.now() - d0;
    await page.waitForTimeout(12_000);
    return { shellAt, ledgerAt, settledAt: Date.now() - t0 };
}
async function accountsDetail(page: Page) {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.locator("[data-adminv2-sidebar-modal-nav='financials']").first().click({ force: true, timeout: 20_000 });
    await page.waitForTimeout(11_000);
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-detail='true']")).toHaveCount(1, { timeout: 120_000 });
    await page.waitForTimeout(14_000);
}

test("six KPIs, exact equality, same Certhouse account", async ({ page }) => {
    const timing = await focusDetails(page);
    const focus = await page.evaluate(INNER);
    log(`FOCUS ${JSON.stringify(focus, null, 1)}`);
    log(`FOCUS DETAILS TIMING ${JSON.stringify(timing)}`);
    await shot(page, "K1-focus-details");

    await accountsDetail(page);
    const accounts = await page.evaluate(INNER);
    log(`ACCOUNTS ${JSON.stringify(accounts, null, 1)}`);
    await shot(page, "K2-accounts-details");

    const kpiDiffs: string[] = [];
    for (const k of Object.keys((focus as { kpis: Record<string, string> }).kpis)) {
        const a = (focus as { kpis: Record<string, string> }).kpis[k];
        const b = (accounts as { kpis: Record<string, string> }).kpis[k];
        if (a !== b) kpiDiffs.push(`${k}: focus=${a} accounts=${b}`);
    }
    const innerDiffs: string[] = [];
    for (const k of new Set([...Object.keys(focus), ...Object.keys(accounts)])) {
        if (k === "kpis") continue;
        const a = JSON.stringify((focus as Record<string, unknown>)[k]);
        const b = JSON.stringify((accounts as Record<string, unknown>)[k]);
        if (a !== b) innerDiffs.push(`${k}: focus=${a} accounts=${b}`);
    }
    log(`KPI DIFFERENCES (${kpiDiffs.length}): ${kpiDiffs.join(" | ") || "(none)"}`);
    log(`OTHER INNER DIFFERENCES (${innerDiffs.length}): ${innerDiffs.join(" | ") || "(none)"}`);
    save("parity", { focus, accounts, kpiDiffs, innerDiffs, timing });

    for (const k of ["CURRENT BALANCE", "DUE", "PAST DUE", "RESPONSIBILITY", "PAID", "AVAILABLE PREPAID"]) {
        expect(
            (focus as { kpis: Record<string, string> }).kpis[k],
            `${k} must be identical across hosts`,
        ).toBe((accounts as { kpis: Record<string, string> }).kpis[k]);
    }
    expect(innerDiffs.length, "unexplained inner-product differences").toBe(0);
});
