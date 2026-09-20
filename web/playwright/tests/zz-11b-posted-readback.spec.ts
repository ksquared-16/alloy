/** §8/§9/§10 — the posted specimen's six identities, read from the product's own detail. */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-accounting";
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(420_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const SPECIMEN = "18e860f9-8ce5-4645-9283-ca3ebcb9a4a9";

test("posted specimen read-back", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url()).not.toContain("/login");
    await page.locator('[data-adminv2-sidebar-modal-nav="financials"]').first().click({ force: true });
    await page.waitForTimeout(9000);
    await page.locator('[data-workspace-section-tab="charges"]').first().click({ force: true });
    await page.waitForTimeout(11_000);
    /* It left the awaiting-posting queue when it posted; it is in the Posted view now. */
    await page.locator('[data-financials-charges-view="posted"]').first().click({ force: true });
    await page.waitForTimeout(9000);
    const row = page.locator(`[data-financials-posted-row="${SPECIMEN}"]`);
    log(`posted row for specimen: ${await row.count()}`);
    if (await row.count() === 0) {
        const all = await page.locator("[data-financials-posted-row]").count();
        log(`posted rows present: ${all}`);
        writeFileSync(`${OUT}/posted-readback.json`, JSON.stringify({ blocked: "specimen not in posted view", postedRows: all }, null, 2));
        return;
    }
    await row.first().click({ force: true });
    await page.waitForTimeout(11_000);

    const out = await page.evaluate(() => {
        const byTid = (tid: string) => {
            const el = document.querySelector(`[data-testid="${tid}"]`) as HTMLElement | null;
            return el ? el.innerText.replace(/\n+/g, " · ").trim() : null;
        };
        const body = document.body.innerText || "";
        const at = body.indexOf("Posting");
        return {
            /* The six identities, each named by the product. */
            serviceDate: (() => { const i = body.indexOf("Charge is for"); return i < 0 ? null : body.slice(i, i + 40).replace(/\n+/g, " · "); })(),
            billingPeriod: byTid("billing-period"),
            invoiceDate: byTid("invoice-date"),
            dueDate: byTid("due-date"),
            accountingPeriod: byTid("accounting-period"),
            deferredFrom: byTid("accounting-deferred-from"),
            glAccount: byTid("gl-account"),
            postingBlock: at < 0 ? null : body.slice(at, at + 400).replace(/\n+/g, " · "),
            paymentsMentioned: /No payments|Payments/.test(body),
        };
    });
    log(`\nPOSTED READ-BACK:\n${JSON.stringify(out, null, 1)}`);
    await page.screenshot({ path: `${OUT}/posted-readback.png`, fullPage: true });
    writeFileSync(`${OUT}/posted-readback.json`, JSON.stringify(out, null, 2));
});
