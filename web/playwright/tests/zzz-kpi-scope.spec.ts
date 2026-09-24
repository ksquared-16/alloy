/** Which host's KPI band responds to the subject filter, and what does each claim to be scoped to? */
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
    const root = document.querySelector("[data-financials-detail='true']") as HTMLElement | null;
    const txt = root?.innerText.replace(/\s+/g, " ") ?? "";
    const kpi = (l: string) => { const m = txt.match(new RegExp(l + "\\s*(-?\\$[\\d,]+\\.\\d{2}|None)")); return m ? m[1] : "ABSENT"; };
    const trig = Array.from(root?.querySelectorAll("button") ?? []).find((b) => /Everyone|Certa Certhouse|Certb Certhouse|Household/.test((b.textContent || "").trim()));
    return {
        scopeControlValue: trig ? (trig.textContent || "").replace(/\s+/g, " ").trim() : null,
        balance: kpi("CURRENT BALANCE"), pastDue: kpi("PAST DUE"), responsibility: kpi("RESPONSIBILITY"),
        ledgerRows: root?.querySelectorAll("[data-financials-ledger-row]").length ?? 0,
    };
};
async function cycle(page: Page, host: string) {
    const out: Record<string, unknown>[] = [{ step: "as opened", ...(await page.evaluate(READ)) }];
    for (const opt of ["Certa Certhouse", "Certb Certhouse", "Everyone"]) {
        const trig = page.locator("[data-financials-detail='true'] button").filter({ hasText: /Everyone|Certa Certhouse|Certb Certhouse|Household/ }).first();
        if (!(await trig.count())) break;
        await trig.click({ timeout: 20_000 });
        await page.waitForTimeout(2500);
        const o = page.locator("[role='option']").filter({ hasText: new RegExp("^" + opt) }).first();
        if (!(await o.count())) { await page.keyboard.press("Escape"); continue; }
        await o.click({ timeout: 20_000 });
        await page.waitForTimeout(10_000);
        out.push({ step: opt, ...(await page.evaluate(READ)) });
    }
    log(`${host}\n${out.map((r) => JSON.stringify(r)).join("\n")}`);
    return out;
}
test("KPI band response to subject scope, both hosts", async ({ page }) => {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-financials-nav='details']").first()).toHaveCount(1, { timeout: 150_000 });
    await page.locator("[data-financials-nav='details']").first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-detail='true']")).toHaveCount(1, { timeout: 120_000 });
    await page.waitForTimeout(14_000);
    const focus = await cycle(page, "FOCUS PANEL DETAILS");

    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.locator("[data-adminv2-sidebar-modal-nav='financials']").first().click({ force: true, timeout: 20_000 });
    await page.waitForTimeout(11_000);
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-detail='true']")).toHaveCount(1, { timeout: 120_000 });
    await page.waitForTimeout(14_000);
    const accounts = await cycle(page, "ACCOUNTS");
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/P-kpi-scope.json`, JSON.stringify({ focus, accounts }, null, 2));
});
