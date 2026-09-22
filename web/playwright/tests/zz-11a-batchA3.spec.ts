/** §4 — the charge detail, reached by clicking the row BUTTON the Charges tab actually renders. */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-batchA";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(240_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("S4 · charge detail and responsibility administration", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    await page.getByRole("button", { name: /Financials — the financial work/ }).first().click();
    await page.waitForTimeout(9000);
    // Charges is a TAB here — the button-only form times out; pass 2 proved the .or() form.
    await page.getByRole("tab", { name: /^Charges$/ }).or(page.getByRole("button", { name: /^Charges$/ })).first().click({ timeout: 20_000 });
    await page.waitForTimeout(7000);

    // The rows ARE buttons — "Certhouse Family $25.00 Late pickup · Certa Certhouse · August 2026".
    const row = page.getByRole("button", { name: /Certhouse Family.*Late pickup/ }).first();
    const n = await row.count();
    log(`charge row buttons: ${n}`);
    if (!n) { log("NO ROW"); return; }
    await row.click({ timeout: 15_000 });
    await page.waitForTimeout(8000);
    await page.screenshot({ path: `${OUT}/s4-charge-detail-2.png` });

    const d = await page.evaluate(() => {
        const txt = (e: Element) => (e as HTMLElement).innerText?.trim().replace(/\s+/g, " ").slice(0, 80) ?? "";
        const body = document.body.innerText || "";
        const i = body.search(/Responsib/i);
        return {
            manage: Array.from(document.querySelectorAll("button, a")).filter((e) => /manage responsibility/i.test(txt(e))).map(txt),
            saysResponsibility: /Responsib/i.test(body),
            around: i >= 0 ? body.slice(Math.max(0, i - 300), i + 900) : null,
            buttons: [...new Set(Array.from(document.querySelectorAll("button")).map(txt).filter(Boolean))].slice(0, 60),
        };
    });
    writeFileSync(`${OUT}/s4-charge-detail-2.json`, JSON.stringify(d, null, 2));
    log(`manage: ${JSON.stringify(d.manage)}`);
    log(`buttons: ${d.buttons.join(" | ")}`);
    log(`AROUND RESPONSIBILITY:\n${d.around ?? "(absent)"}`);

    if (d.manage.length) {
        await page.getByRole("button", { name: /manage responsibility/i }).first().click({ timeout: 15_000 });
        await page.waitForTimeout(5000);
        await page.screenshot({ path: `${OUT}/s4-manage-open-2.png` });
        const form = await page.evaluate(() => {
            const txt = (e: Element) => (e as HTMLElement).innerText?.trim().replace(/\s+/g, " ").slice(0, 60) ?? "";
            return {
                selects: Array.from(document.querySelectorAll("select")).map((s) => ({
                    id: s.getAttribute("data-testid") || s.getAttribute("name") || "?",
                    options: Array.from(s.options).map((o) => o.text.trim()).slice(0, 10),
                })),
                inputs: Array.from(document.querySelectorAll("input")).map((i) => ({
                    type: i.type, name: i.getAttribute("name") || i.getAttribute("data-testid") || i.getAttribute("placeholder") || "?", value: i.value,
                })).slice(0, 20),
                buttons: [...new Set(Array.from(document.querySelectorAll("button")).map(txt).filter(Boolean))].slice(0, 40),
                text: (document.body.innerText || "").slice(0, 3000),
            };
        });
        writeFileSync(`${OUT}/s4-manage-form-2.json`, JSON.stringify(form, null, 2));
        log(`FORM selects: ${JSON.stringify(form.selects)}`);
        log(`FORM inputs: ${JSON.stringify(form.inputs)}`);
        log(`FORM buttons: ${form.buttons.join(" | ")}`);
    }
});
