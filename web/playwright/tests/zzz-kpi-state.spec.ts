/** The live client state behind the KPI band, in both hosts, captured with the rendered values. */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/kpi-authority";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(1_200_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const STATE = () => {
    const shell = document.querySelector("[data-financials-card='true']") as HTMLElement | null;
    const root = document.querySelector("[data-financials-detail='true']") as HTMLElement | null;
    const txt = root?.innerText.replace(/\s+/g, " ") ?? "";
    const kpi = (l: string) => { const m = txt.match(new RegExp(l + "\\s*(-?\\$[\\d,]+\\.\\d{2}|None)")); return m ? m[1] : "ABSENT"; };
    const scopeBtn = Array.from(root?.querySelectorAll("button") ?? []).find((b) => /Everyone|Certa Certhouse|Certb Certhouse|Household/.test((b.textContent || "").trim()));
    return {
        subjectFilterAttr: shell?.getAttribute("data-financials-subject") ?? null,
        accountAttr: shell?.getAttribute("data-financials-account") ?? null,
        scopeControlShows: scopeBtn ? (scopeBtn.textContent || "").replace(/\s+/g, " ").trim() : null,
        lensText: (root?.querySelector("[data-financials-lenses='true']") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").trim().slice(0, 90) ?? null,
        domLedgerRows: root?.querySelectorAll("[data-financials-ledger-row]").length ?? 0,
        balance: kpi("CURRENT BALANCE"), pastDue: kpi("PAST DUE"), responsibility: kpi("RESPONSIBILITY"),
        due: kpi("DUE"), paid: kpi("PAID"), prepaid: kpi("AVAILABLE PREPAID"),
    };
};
test("live state, both hosts", async ({ page }) => {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-financials-nav='details']").first()).toHaveCount(1, { timeout: 150_000 });
    await page.locator("[data-financials-nav='details']").first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-detail='true']")).toHaveCount(1, { timeout: 120_000 });
    await page.waitForTimeout(16_000);
    const focus = await page.evaluate(STATE);
    log(`FOCUS ${JSON.stringify(focus, null, 1)}`);

    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.locator("[data-adminv2-sidebar-modal-nav='financials']").first().click({ force: true, timeout: 20_000 });
    await page.waitForTimeout(11_000);
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-detail='true']")).toHaveCount(1, { timeout: 120_000 });
    await page.waitForTimeout(16_000);
    const accounts = await page.evaluate(STATE);
    log(`ACCOUNTS ${JSON.stringify(accounts, null, 1)}`);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/live-state.json`, JSON.stringify({ focus, accounts }, null, 2));
});
