/** SECTION 2 — discount provenance on the real operator surfaces, both of them. */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-provenance";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("A · Focus Panel Details — reductions state their decision", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.getByRole("button", { name: /^Details$/ }).first().click();
    await page.waitForTimeout(9000);
    // Credits & adjustments lens — the existing filter, not a new section.
    const lens = page.getByRole("button", { name: /Credits & adjustments/i }).first();
    if (await lens.count()) { await lens.click(); await page.waitForTimeout(3500); }
    await page.screenshot({ path: `${OUT}/a-details-credits.png` });

    const r = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("[class*='billingdetail__']"))
            .map((e) => (e as HTMLElement).innerText.trim()).filter(Boolean);
        const txt = document.body.innerText || "";
        const types = Array.from(document.querySelectorAll("[class*='billingdetail__type']"))
            .map((e) => (e as HTMLElement).innerText.trim());
        return {
            typeValues: [...new Set(types)].slice(0, 12),
            saysDiscount: /\bDiscount\b/.test(txt),
            saysReversal: /\bReversal\b/.test(txt),
            saysOngoing: /\bOngoing\b/.test(txt),
            saysOneTime: /\bOne-time\b/.test(txt),
            hasPercentBasis: /\d+% of \$/.test(txt),
            sample: rows.slice(0, 8),
        };
    });
    writeFileSync(`${OUT}/a-details.json`, JSON.stringify(r, null, 2));
    /* eslint-disable no-console */
    log(`type column values : ${JSON.stringify(r.typeValues)}`);
    log(`says Discount=${r.saysDiscount} Reversal=${r.saysReversal} Ongoing=${r.saysOngoing} One-time=${r.saysOneTime} basis%=${r.hasPercentBasis}`);
    log(`sample rows: ${JSON.stringify(r.sample.slice(0, 4))}`);
    /* eslint-enable no-console */
});

test("B · Workspace Accounts — the same meaning", async ({ page }) => {
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    /*
     * THE SIDEBAR NAV ITEM, not a button named "Financials".
     *
     * The previous probe clicked the first control matching /^Financials$/ and left the shell at 930
     * characters — the account surface never opened and the run reported a false absence. Financials
     * → Accounts is a MODAL raised from the sidebar, and the item's accessible name is its TITLE:
     * "Financials — the financial work waiting on an operator, and the accounts it belongs to".
     *
     * This was a harness defect. Nothing in the product changed to accommodate it.
     */
    const fin = page.getByRole("button", { name: /Financials — the financial work/ }).first();
    if (await fin.count()) { await fin.click(); await page.waitForTimeout(9000); }
    else {
        const alt = page.locator('[aria-label^="Financials"]').first();
        if (await alt.count()) { await alt.click(); await page.waitForTimeout(9000); }
    }
    /*
     * The modal opens on OVERVIEW. Accounts is a tab, and an account must then be chosen — the
     * ledger belongs to an account, so a probe that stopped at the modal was measuring a dashboard
     * and calling it an absence.
     */
    const accountsTab = page.getByRole("tab", { name: /^Accounts$/ }).or(page.getByRole("button", { name: /^Accounts$/ })).first();
    if (await accountsTab.count()) { await accountsTab.click(); await page.waitForTimeout(6000); }
    const account = page.getByText(/Certhouse Family/).first();
    if (await account.count()) { await account.click(); await page.waitForTimeout(7000); }
    const lens2 = page.getByRole("button", { name: /Credits & adjustments/i }).first();
    if (await lens2.count()) { await lens2.click(); await page.waitForTimeout(3500); }
    await page.screenshot({ path: `${OUT}/b-workspace.png` });
    const r = await page.evaluate(() => {
        const txt = document.body.innerText || "";
        return {
            saysDiscount: /\bDiscount\b/.test(txt),
            saysReversal: /\bReversal\b/.test(txt),
            saysCreditsLens: /Credits & adjustments/i.test(txt),
            saysOngoing: /\bOngoing\b/.test(txt),
            hasPercentBasis: /\d+% of \$/.test(txt),
            typeValues: [...new Set(Array.from(document.querySelectorAll("[class*='type']"))
                .map((e) => (e as HTMLElement).innerText.trim()).filter((v) => v && v.length < 20))].slice(0, 12),
            len: txt.length,
        };
    });
    /* eslint-disable no-console */
    log(`workspace: Discount=${r.saysDiscount} Reversal=${r.saysReversal} lens=${r.saysCreditsLens} Ongoing=${r.saysOngoing} basis%=${r.hasPercentBasis} textLen=${r.len}`);
    log(`workspace type values: ${JSON.stringify(r.typeValues)}`);
    /* eslint-enable no-console */
});
