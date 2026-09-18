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
    const fin = page.getByRole("button", { name: /^Financials$/ }).first();
    if (await fin.count()) { await fin.click(); await page.waitForTimeout(8000); }
    await page.screenshot({ path: `${OUT}/b-workspace.png` });
    const r = await page.evaluate(() => {
        const txt = document.body.innerText || "";
        return {
            saysDiscount: /\bDiscount\b/.test(txt),
            saysReversal: /\bReversal\b/.test(txt),
            saysCreditsLens: /Credits & adjustments/i.test(txt),
            len: txt.length,
        };
    });
    /* eslint-disable no-console */
    log(`workspace: Discount=${r.saysDiscount} Reversal=${r.saysReversal} lens=${r.saysCreditsLens} textLen=${r.len}`);
    /* eslint-enable no-console */
});
