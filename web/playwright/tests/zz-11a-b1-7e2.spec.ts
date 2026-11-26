/** §7E — a charge created under the policy, and the five dates read off its detail. */
import { test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-b1";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(290_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

async function addCharge(page: Page, template: RegExp, child: string) {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.getByRole("button", { name: /^Details$/ }).first().click();
    await page.waitForTimeout(8000);
    await page.getByRole("button", { name: /^Add$/ }).first().click();
    await page.waitForTimeout(4500);
    const tpl = page.locator('[data-financials-overlay="add_charge"] select').first();
    const names = await tpl.locator("option").allTextContents();
    const idx = names.findIndex((n) => template.test(n));
    await tpl.selectOption({ index: idx >= 0 ? idx : 0 });
    await page.waitForTimeout(3000);
    await page.locator('[data-financials-overlay="add_charge"] select').nth(1).selectOption({ label: child }).catch(() => undefined);
    await page.waitForTimeout(2500);
    await page.getByRole("button", { name: /^Add charge$/ }).first().click();
    await page.waitForTimeout(12_000);
}

/** The charge detail's dates, by their own test ids — never read off prose. */
const dates = (p: Page) => p.evaluate(() => {
    const val = (id: string) => {
        const el = document.querySelector(`[data-testid="${id}"]`);
        return el ? (el as HTMLElement).innerText.trim().replace(/\s+/g, " ") : null;
    };
    const body = document.body.innerText || "";
    const head = body.slice(body.indexOf("Account-wide financial detail"), body.indexOf("Account-wide financial detail") + 260);
    return {
        head: head.replace(/\n+/g, " / "),
        invoiceDate: val("invoice-date"), dueDate: val("due-date"),
        billingPeriod: val("billing-period"), accountingPeriod: val("accounting-period"),
    };
});

async function openCharge(page: Page, name: RegExp) {
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    await page.getByRole("button", { name: /Financials — the financial work/ }).first().click();
    await page.waitForTimeout(9000);
    await page.getByRole("tab", { name: /^Charges$/ }).or(page.getByRole("button", { name: /^Charges$/ })).first().click({ timeout: 20_000 });
    await page.waitForTimeout(7000);
    await page.getByRole("tab", { name: /^Posted/ }).or(page.getByRole("button", { name: /^Posted/ })).first().click({ timeout: 15_000 });
    await page.waitForTimeout(6000);
    const row = page.getByRole("button", { name }).first();
    if (!(await row.count())) return false;
    await row.click({ timeout: 15_000 });
    await page.waitForTimeout(7000);
    return true;
}

test("7E-A · on_invoice", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await addCharge(page, /materials/i, "Certa Certhouse");
    const found = await openCharge(page, /Certhouse Family \$18\.00 Sep 18, 2026/);
    log(`opened: ${found}`);
    if (!found) { log("MATERIALS ROW NOT FOUND"); return; }
    const d = await dates(page);
    log(`7E-A DATES: ${JSON.stringify(d, null, 1)}`);
    writeFileSync(`${OUT}/b1-7e-a.json`, JSON.stringify(d, null, 2));
    await page.screenshot({ path: `${OUT}/b1-7e-a.png` });
});
