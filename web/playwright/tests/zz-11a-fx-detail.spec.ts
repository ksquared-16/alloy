/**
 * §13/§14/§16 — one generated recurring obligation, opened and read.
 *
 * Invoice date and Due Date as distinct fields, gross/discount/net with provenance where a policy
 * legitimately applies, and the Billing Period beside the Accounting Period so the two are visibly
 * independent. Charge rows are buttons, not table rows — a `[data-charge-id]` sweep found none.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-cx";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(500_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("open a generated tuition charge", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    await page.getByRole("button", { name: /Financials — the financial work/ }).first().click();
    await page.waitForTimeout(9000);
    await page.getByRole("tab", { name: /^Charges$/ }).or(page.getByRole("button", { name: /^Charges$/ })).first().click({ timeout: 20_000 });
    await page.waitForTimeout(9000);

    const results: Array<Record<string, unknown>> = [];
    for (const who of ["Certb", "Certa"]) {
        const row = page.locator("button", { hasText: new RegExp(`Tuition · ${who} Certhouse · September 2026`) }).first();
        const n = await row.count();
        log(`${who}: rows = ${n}`);
        if (!n) continue;
        await row.click();
        await page.waitForTimeout(9000);
        await page.screenshot({ path: `${OUT}/detail-${who}.png`, fullPage: true });
        const detail = await page.evaluate(() => {
            const pick = (re: RegExp) => {
                const t = document.body.innerText || "";
                const m = re.exec(t);
                return m ? m[0].replace(/\s+/g, " ").trim() : null;
            };
            const panel = document.querySelector("[data-financials-detail], [data-charge-detail]") as HTMLElement | null;
            return {
                invoiceDate: pick(/Invoice date[\s\S]{0,40}/i),
                dueDate: pick(/Due date[\s\S]{0,40}/i),
                billingPeriod: pick(/Billing period[\s\S]{0,40}/i),
                accountingPeriod: pick(/Accounting period[\s\S]{0,60}/i),
                gross: pick(/Gross[\s\S]{0,30}/i),
                discount: pick(/Discount[\s\S]{0,30}/i),
                net: pick(/Net[\s\S]{0,30}/i),
                serviceDate: pick(/Service date[\s\S]{0,40}/i),
                panelText: (panel?.innerText ?? document.body.innerText).replace(/\n{2,}/g, "\n").slice(0, 2200),
            };
        });
        results.push({ who, detail });
        log(`\n=== ${who} ===\n${JSON.stringify(detail, null, 1).slice(0, 2600)}`);
    }
    writeFileSync(`${OUT}/detail.json`, JSON.stringify(results, null, 2));
});
