/** HOST PARITY + ACCOUNTS NON-REGRESSION on the repaired runtime. Read only. */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/runtime-unblock";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(1_500_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const save = (n: string, v: unknown) => { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/${n}.json`, JSON.stringify(v, null, 2)); };
const shot = async (p: Page, n: string) => { mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: `${OUT}/${n}.png` }); };

/** The INNER product only — outer host chrome is deliberately excluded. */
const INNER = () => {
    const root = document.querySelector("[data-financials-detail='true']") as HTMLElement | null;
    if (!root) return { present: false } as Record<string, unknown>;
    const q = (s: string) => root.querySelectorAll(s).length;
    const t = (s: string) => { const e = root.querySelector(s) as HTMLElement | null; return e ? e.innerText.replace(/\s+/g, " ").trim() : null; };
    const kpis: Record<string, string> = {};
    const txt = root.innerText.replace(/\s+/g, " ");
    for (const label of ["CURRENT BALANCE", "DUE", "PAST DUE", "RESPONSIBILITY", "PAID", "AVAILABLE PREPAID"]) {
        const m = txt.match(new RegExp(label + "\\s*(-?\\$[\\d,]+\\.\\d{2}|None)"));
        kpis[label] = m ? m[1] : "ABSENT";
    }
    return {
        present: true,
        kpis,
        relationshipRow: t("[data-financials-payer-row='true']"),
        rowGroups: q("[data-financials-row-group]"),
        identityGroup: q("[data-financials-row-group='identity']"),
        discountGroup: q("[data-financials-row-group='discount']"),
        paymentGroup: q("[data-financials-row-group='payment']"),
        discountSummary: t("[data-financials-discount-summary='true']"),
        discountGear: q("[data-financials-manage-discounts='gear']"),
        methodState: t("[data-financials-method-state='true']"),
        managePayments: q("[data-financials-manage-payments='open']"),
        responsibilityGear: q("[data-financials-manage-responsibility='gear']"),
        responsibleFilter: q("[data-testid='financials-filter-responsible-party']"),
        lenses: t("[data-financials-lenses='true']"),
        ledgerRows: q("[data-financials-ledger-row]"),
        actions: q("[data-financials-actions='true']"),
    };
};
async function focusDetails(page: Page) {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-financials-nav='details']").first()).toHaveCount(1, { timeout: 150_000 });
    await page.locator("[data-financials-nav='details']").first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-detail='true']")).toHaveCount(1, { timeout: 120_000 });
    await page.waitForTimeout(7000);
}
async function accountsDetail(page: Page) {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.locator("[data-adminv2-sidebar-modal-nav='financials']").first().click({ force: true, timeout: 20_000 });
    await page.waitForTimeout(11_000);
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-detail='true']")).toHaveCount(1, { timeout: 120_000 });
    await page.waitForTimeout(9000);
}

test("HOST PARITY — Focus Panel Details vs Accounts, same account", async ({ page }) => {
    await focusDetails(page);
    const focus = await page.evaluate(INNER);
    log(`FOCUS INNER ${JSON.stringify(focus, null, 1)}`);
    await shot(page, "P1-focus-details");
    await accountsDetail(page);
    const accounts = await page.evaluate(INNER);
    log(`ACCOUNTS INNER ${JSON.stringify(accounts, null, 1)}`);
    await shot(page, "P2-accounts-details");

    const diffs: string[] = [];
    const keys = new Set([...Object.keys(focus), ...Object.keys(accounts)]);
    for (const k of keys) {
        if (k === "kpis") continue;
        const a = JSON.stringify((focus as Record<string, unknown>)[k]);
        const b = JSON.stringify((accounts as Record<string, unknown>)[k]);
        if (a !== b) diffs.push(`${k}: focus=${a} accounts=${b}`);
    }
    for (const label of Object.keys((focus as { kpis: Record<string, string> }).kpis)) {
        const a = (focus as { kpis: Record<string, string> }).kpis[label];
        const b = (accounts as { kpis: Record<string, string> }).kpis[label];
        if (a !== b) diffs.push(`KPI ${label}: focus=${a} accounts=${b}`);
    }
    log(`INNER PRODUCT DIFFERENCES (${diffs.length}):\n${diffs.join("\n") || "(none)"}`);
    save("P-host-parity", { focus, accounts, diffs });
});

test("ACCOUNTS NON-REGRESSION — Certhouse, switch away, switch back", async ({ page }) => {
    await accountsDetail(page);
    const READ = () => {
        const rows = Array.from(document.querySelectorAll("[data-financials-account-row]")).map((e) => ({
            id: e.getAttribute("data-financials-account-row"),
            selected: e.getAttribute("data-financials-account-selected"),
            label: (e as HTMLElement).innerText.replace(/\s+/g, " ").trim().slice(0, 34),
        }));
        const bd = document.querySelector(".alloy-accounts-command-backdrop") as HTMLElement | null;
        const d = document.querySelector("[data-financials-detail='true']") as HTMLElement | null;
        return {
            selected: rows.find((r) => r.selected === "true")?.id ?? null,
            selectedLabel: rows.find((r) => r.selected === "true")?.label ?? null,
            backdropDisplay: bd ? getComputedStyle(bd).display : "absent",
            ledgerRows: document.querySelectorAll("[data-financials-ledger-row]").length,
            kpiLine: d ? (d.innerText.replace(/\s+/g, " ").match(/CURRENT BALANCE\s*(-?\$[\d,]+\.\d{2})/) || [])[1] ?? null : null,
            rows: rows.slice(0, 6),
        };
    };
    const first = await page.evaluate(READ);
    log(`ACCOUNTS 1 ${JSON.stringify({ ...first, rows: undefined })}`);
    expect(first.backdropDisplay, "no permanent backdrop").toBe("none");

    const other = first.rows.find((r) => r.selected !== "true" && r.id !== first.selected)!;
    await page.locator(`[data-financials-account-row="${other.id}"]`).first().click({ timeout: 25_000 });
    await page.waitForTimeout(11_000);
    const second = await page.evaluate(READ);
    log(`ACCOUNTS 2 (switched to ${other.label}) ${JSON.stringify({ ...second, rows: undefined })}`);
    expect(second.selected, "selection moved").toBe(other.id);
    expect(second.kpiLine, "the ledger truth moved with it").not.toBe(first.kpiLine);

    await page.locator(`[data-financials-account-row="${first.selected}"]`).first().click({ timeout: 25_000 });
    await page.waitForTimeout(11_000);
    const back = await page.evaluate(READ);
    log(`ACCOUNTS 3 (switched back) ${JSON.stringify({ ...back, rows: undefined })}`);
    save("P-accounts-switch", { first, second, back });
    await shot(page, "P3-accounts-switched-back");
    expect(back.selected, "switching back restores the original account").toBe(first.selected);
    expect(back.kpiLine, "and its truth").toBe(first.kpiLine);
    expect(back.backdropDisplay, "still no backdrop").toBe("none");
});
