/** The grain change must not regress the charge detail's responsibility block. */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-setup";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("charge detail responsibility after the grain change", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
    page.on("response", (r) => { if (r.url().includes("/api/admin/financials/charge") && r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });

    /* Financials is a MODAL opened from the sidebar, not a route. */
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(15_000);
    const nav = page.getByRole("button", { name: /^Financials$/ }).first();
    log(`sidebar Financials: ${await nav.count()}`);
    if (await nav.count()) { await nav.click().catch(() => {}); await page.waitForTimeout(13_000); }
    const accounts = page.getByRole("button", { name: /^Accounts/ }).first();
    log(`Accounts tab: ${await accounts.count()}`);
    if (await accounts.count()) { await accounts.click().catch(() => {}); await page.waitForTimeout(11_000); }
    const acct = page.locator("[data-account-row], tbody tr").first();
    log(`account rows: ${await page.locator("[data-account-row], tbody tr").count()}`);
    if (await acct.count()) { await acct.click().catch(() => {}); await page.waitForTimeout(11_000); }
    log(`filter slot now: ${await page.locator("[data-financials-filter-slot]").count()}`);
    const row = page.locator("[data-ledger-row], [data-charge-row]").first();
    log(`ledger rows: ${await page.locator("[data-ledger-row], [data-charge-row]").count()}`);
    if (await row.count()) { await row.click().catch(() => {}); await page.waitForTimeout(10_000); }

    const out = await page.evaluate(() => {
        const t = document.body.innerText || "";
        const i = t.indexOf("Responsib");
        return {
            filterSlot: Boolean(document.querySelector("[data-financials-filter-slot]")),
            responsibleFilter: Boolean(document.querySelector("[data-testid='financials-filter-responsible-party']")),
            detailOpen: Boolean(document.querySelector("[data-charge-detail], [data-testid='charge-detail']")),
            around: i < 0 ? null : t.slice(Math.max(0, i - 120), i + 420).replace(/\n+/g, " / "),
        };
    });
    log(JSON.stringify(out, null, 1));
    log(`\nERRORS: ${JSON.stringify(errors.slice(0, 6))}`);
    await page.screenshot({ path: `${OUT}/responsibility-after.png`, fullPage: true });
    writeFileSync(`${OUT}/responsibility.json`, JSON.stringify({ ...out, errors }, null, 2));
});
