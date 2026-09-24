/**
 * §17 CORRECTNESS ORACLE — the performance work must not have moved a cent or a row.
 *
 * Counts are a weak oracle: a reordering or a substitution keeps 116 rows. This compares row
 * IDENTITIES across the two hosts, and pins the six KPIs to the literals measured before the
 * collectible batching and the coalescer landed.
 */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/perf-oracle";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(1_500_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

/** The values the ledger showed before any of this slice's performance work. */
const PINNED = {
    "CURRENT BALANCE": "$2,023.87",
    DUE: "$1,912.00",
    RESPONSIBILITY: "$1,525.00",
    PAID: "$2,098.87",
    "PAST DUE": "$75.00",
    "AVAILABLE PREPAID": "$125.00",
};
const PINNED_ROWS = 116;

const READ = () => {
    const root = document.querySelector("[data-financials-detail='true']") as HTMLElement | null;
    if (!root) return { present: false, kpis: {}, rows: [] as string[] };
    const txt = root.innerText.replace(/\s+/g, " ");
    const kpi = (l: string) => { const m = txt.match(new RegExp(l + "\\s*(-?\\$[\\d,]+\\.\\d{2}|None)")); return m ? m[1] : "ABSENT"; };
    const rows = Array.from(root.querySelectorAll("[data-financials-ledger-row]")).map(
        (e) => (e as HTMLElement).innerText.replace(/\s+/g, " ").trim(),
    );
    return {
        present: true,
        kpis: {
            "CURRENT BALANCE": kpi("CURRENT BALANCE"), DUE: kpi("DUE"), "PAST DUE": kpi("PAST DUE"),
            RESPONSIBILITY: kpi("RESPONSIBILITY"), PAID: kpi("PAID"), "AVAILABLE PREPAID": kpi("AVAILABLE PREPAID"),
        },
        rows,
    };
};

async function settle(page: Page) {
    await page.waitForFunction(() => document.querySelectorAll("[data-financials-ledger-row]").length > 0, undefined, { timeout: 180_000 }).catch(() => undefined);
    let prev = -1, stable = 0;
    for (let i = 0; i < 50 && stable < 3; i++) {
        const n = await page.evaluate(() => document.querySelectorAll("[data-financials-ledger-row]").length);
        if (n === prev && n > 0) stable += 1; else stable = 0;
        prev = n;
        await page.waitForTimeout(350);
    }
}

test("same cents, same rows, both hosts, after the repair", async ({ page }) => {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-financials-nav='details']").first()).toHaveCount(1, { timeout: 150_000 });
    expect(page.url(), "the governed QA session is live").not.toContain("/login");
    await page.locator("[data-financials-nav='details']").first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-detail='true']")).toHaveCount(1, { timeout: 150_000 });
    await settle(page);
    const focus = await page.evaluate(READ);

    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.locator("[data-adminv2-sidebar-modal-nav='financials']").first().click({ force: true, timeout: 20_000 });
    await page.waitForTimeout(11_000);
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-detail='true']")).toHaveCount(1, { timeout: 150_000 });
    await settle(page);
    const accounts = await page.evaluate(READ);

    /* Identity, not count: which rows does one host have that the other does not? */
    const bag = (xs: string[]) => { const m = new Map<string, number>(); xs.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1)); return m; };
    const fb = bag(focus.rows), ab = bag(accounts.rows);
    const rowDiffs: string[] = [];
    for (const k of new Set([...fb.keys(), ...ab.keys()])) {
        const a = fb.get(k) ?? 0, b = ab.get(k) ?? 0;
        if (a !== b) rowDiffs.push(`focus×${a} accounts×${b}: ${k.slice(0, 110)}`);
    }
    const kpiDiffs = Object.keys(PINNED).filter((k) => (focus.kpis as Record<string, string>)[k] !== (accounts.kpis as Record<string, string>)[k]);
    const drift = Object.entries(PINNED).filter(([k, v]) => (focus.kpis as Record<string, string>)[k] !== v).map(([k, v]) => `${k}: pinned=${v} now=${(focus.kpis as Record<string, string>)[k]}`);

    log(`FOCUS   rows=${focus.rows.length} kpis=${JSON.stringify(focus.kpis)}`);
    log(`ACCOUNTS rows=${accounts.rows.length} kpis=${JSON.stringify(accounts.kpis)}`);
    log(`ROW IDENTITY DIFFERENCES (${rowDiffs.length}): ${rowDiffs.slice(0, 12).join(" | ") || "(none)"}`);
    log(`KPI HOST DIFFERENCES (${kpiDiffs.length}): ${kpiDiffs.join(", ") || "(none)"}`);
    log(`DRIFT FROM PRE-PERF LITERALS (${drift.length}): ${drift.join(" | ") || "(none)"}`);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/oracle.json`, JSON.stringify({ focus, accounts, rowDiffs, kpiDiffs, drift }, null, 2));
    await page.screenshot({ path: `${OUT}/accounts-after.png` });

    expect(drift, "the six KPIs must be unchanged by the performance work").toEqual([]);
    expect(focus.rows.length, "focus ledger row count").toBe(PINNED_ROWS);
    expect(accounts.rows.length, "accounts ledger row count").toBe(PINNED_ROWS);
    expect(rowDiffs, "row identities must match across hosts, not merely their counts").toEqual([]);
    expect(kpiDiffs, "KPI host differences").toEqual([]);
});
