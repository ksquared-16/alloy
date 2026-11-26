/** Are the parity differences SCOPE, or product? Set both hosts to the same subject scope. */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/runtime-unblock";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(1_500_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const READ = () => {
    const shell = document.querySelector("[data-financials-card='true']") as HTMLElement | null;
    const root = document.querySelector("[data-financials-detail='true']") as HTMLElement | null;
    const txt = root?.innerText.replace(/\s+/g, " ") ?? "";
    const kpi = (label: string) => { const m = txt.match(new RegExp(label + "\\s*(-?\\$[\\d,]+\\.\\d{2}|None)")); return m ? m[1] : "ABSENT"; };
    return {
        subjectFilter: shell?.getAttribute("data-financials-subject") ?? null,
        account: shell?.getAttribute("data-financials-account") ?? null,
        kpis: {
            "CURRENT BALANCE": kpi("CURRENT BALANCE"), DUE: kpi("DUE"), "PAST DUE": kpi("PAST DUE"),
            RESPONSIBILITY: kpi("RESPONSIBILITY"), PAID: kpi("PAID"), "AVAILABLE PREPAID": kpi("AVAILABLE PREPAID"),
        },
        discountSummary: (root?.querySelector("[data-financials-discount-summary='true']") as HTMLElement | null)?.innerText.trim() ?? null,
        ledgerRows: root?.querySelectorAll("[data-financials-ledger-row]").length ?? 0,
    };
};
/** Set the subject ("Everyone") filter to a named option. */
async function setScope(page: Page, option: RegExp, label: string) {
    const trigger = page.locator("[data-financials-detail='true'] button").filter({ hasText: /Everyone|Certa|Certb/ }).first();
    if (!(await trigger.count())) { log(`${label}: scope control absent`); return false; }
    await trigger.click({ timeout: 20_000 });
    await page.waitForTimeout(2500);
    const opts = await page.evaluate(() => Array.from(document.querySelectorAll("[role='option']")).map((o) => (o as HTMLElement).innerText.replace(/\s+/g, " ").trim()));
    log(`${label} scope options: ${JSON.stringify(opts)}`);
    const o = page.locator("[role='option']").filter({ hasText: option }).first();
    if (!(await o.count())) { await page.keyboard.press("Escape"); return false; }
    await o.click({ timeout: 20_000 });
    await page.waitForTimeout(9000);
    return true;
}

test("the parity differences are subject scope, not product", async ({ page }) => {
    /* FOCUS: opens scoped to the child the panel is about. */
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-financials-nav='details']").first()).toHaveCount(1, { timeout: 150_000 });
    await page.locator("[data-financials-nav='details']").first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-detail='true']")).toHaveCount(1, { timeout: 120_000 });
    await page.waitForTimeout(14_000);
    const focusScoped = await page.evaluate(READ);
    log(`FOCUS as opened ${JSON.stringify(focusScoped)}`);
    const moved = await setScope(page, /^Everyone/, "FOCUS");
    await page.waitForTimeout(6000);
    const focusAll = await page.evaluate(READ);
    log(`FOCUS at Everyone (moved=${moved}) ${JSON.stringify(focusAll)}`);

    /* ACCOUNTS: opens at the household. */
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.locator("[data-adminv2-sidebar-modal-nav='financials']").first().click({ force: true, timeout: 20_000 });
    await page.waitForTimeout(11_000);
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-detail='true']")).toHaveCount(1, { timeout: 120_000 });
    await page.waitForTimeout(14_000);
    const accounts = await page.evaluate(READ);
    log(`ACCOUNTS as opened ${JSON.stringify(accounts)}`);

    const diffs: string[] = [];
    for (const k of Object.keys(accounts.kpis)) {
        const a = (focusAll.kpis as Record<string, string>)[k];
        const b = (accounts.kpis as Record<string, string>)[k];
        if (a !== b) diffs.push(`KPI ${k}: focus(all)=${a} accounts=${b}`);
    }
    if (focusAll.discountSummary !== accounts.discountSummary) diffs.push(`discountSummary: focus=${focusAll.discountSummary} accounts=${accounts.discountSummary}`);
    if (focusAll.ledgerRows !== accounts.ledgerRows) diffs.push(`ledgerRows: focus=${focusAll.ledgerRows} accounts=${accounts.ledgerRows}`);
    log(`AT EQUAL SCOPE — DIFFERENCES (${diffs.length}):\n${diffs.join("\n") || "(none)"}`);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/P-parity-scope.json`, JSON.stringify({ focusScoped, focusAll, accounts, diffs }, null, 2));
});
