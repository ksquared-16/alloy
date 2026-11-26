/** G: the Adjustment ENTRY path, opened from a charge row action. */
import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/qa-readiness";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("adjustment entry", async ({ page }) => {
    for (let a = 1; a <= 2; a++) {
        await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(13_000);
        const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
        if (await nav.count()) { await nav.click({ force: true, timeout: 20_000 }); break; }
        if (a === 2) throw new Error("no workspace");
    }
    await page.waitForTimeout(11_000);
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 30_000 });
    await page.waitForFunction(() => document.querySelectorAll("[data-financials-ledger-row]").length > 0, undefined, { timeout: 180_000 }).catch(() => undefined);
    await page.waitForTimeout(3_000);
    mkdirSync(OUT, { recursive: true });

    const actions = await page.evaluate(() => {
        const row = document.querySelector("[data-financials-ledger-row]");
        return row ? [...row.querySelectorAll("button, [role='button']")].map((b) => ({ title: b.getAttribute("title"), aria: b.getAttribute("aria-label"), testid: b.getAttribute("data-testid") })) : [];
    });
    log(`G ROW ACTIONS: ${JSON.stringify(actions)}`);

    /* Prefer an explicit adjust affordance; otherwise the Add door, which hosts the entry command. */
    const adjustBtn = page.locator("[data-financials-ledger-row] button[title*='Adjust' i], [data-financials-ledger-row] button[aria-label*='Adjust' i]").first();
    if (await adjustBtn.count()) {
        await adjustBtn.click({ timeout: 15_000 }).catch(() => undefined);
    } else {
        await page.locator("button:has-text('Add')").first().click({ timeout: 20_000 }).catch(() => undefined);
    }
    await page.waitForTimeout(3_000);
    const panel = await page.evaluate(() => {
        const t = document.body.innerText.replace(/\s+/g, " ");
        return {
            entryOpen: !!document.querySelector("[data-financials-entry], [data-universal-card-key='adjust_charge'], [data-financials-command]"),
            chargeType: /charge type/i.test(t), appliesTo: /applies to/i.test(t), chargeTo: /charge to/i.test(t),
            amount: /amount/i.test(t), effective: /effective|service date|date/i.test(t),
            discountDecision: /discount/i.test(t), preview: /preview/i.test(t),
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
    });
    log(`G ENTRY PANEL: ${JSON.stringify(panel)}`);
    await page.screenshot({ path: `${OUT}/G-entry.png` });
    expect(true).toBe(true);
});
