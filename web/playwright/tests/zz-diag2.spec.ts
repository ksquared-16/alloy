import { test, expect } from "@playwright/test";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(300_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const CERTA_OCM = "79f8011d-a236-4054-bee7-af10f1dbc632";
test("diagnose", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    expect(page.url()).not.toContain("/login");
    const fc = await page.evaluate(async (ocm) => {
        const r = await fetch(`/api/admin/financials/reduction-forecast?opportunity_customer_member_id=${ocm}`, { credentials: "include", cache: "no-store" });
        return { status: r.status, body: JSON.stringify(await r.json().catch(() => null)).slice(0, 600) };
    }, CERTA_OCM);
    log(`FORECAST ROUTE: ${JSON.stringify(fc, null, 1)}`);
    // What does the Add panel actually render?
    await page.locator('[data-adminv2-sidebar-modal-nav="financials"]').first().click({ force: true });
    await page.waitForTimeout(8000);
    await page.locator('[data-workspace-section-tab="accounts"]').first().click({ force: true });
    await page.waitForTimeout(10_000);
    await page.locator("[data-financials-account-row]").first().click({ force: true });
    await page.waitForTimeout(11_000);
    await page.getByRole("button", { name: /^Add$/ }).first().click({ force: true }).catch((e) => log(`add click: ${e}`));
    await page.waitForTimeout(8000);
    const d = await page.evaluate(() => ({
        addcharge: Boolean(document.querySelector("[data-addcharge-amount], .alloy-os-addcharge__select, [data-addcharge-target]")),
        anyAddAttrs: [...new Set(Array.from(document.querySelectorAll("*")).flatMap((e) => Array.from(e.attributes).map((a) => a.name).filter((n) => n.startsWith("data-addcharge"))))],
        appliesToText: (() => { const i = (document.body.innerText||"").indexOf("Applies to"); return i<0?null:(document.body.innerText).slice(i,i+220).replace(/\n+/g," · "); })(),
    }));
    log(`ADD PANEL: ${JSON.stringify(d, null, 1)}`);
});
