/** §4B — reach the $18 charge detail via Charges → Posted and read the assignment form. No write. */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-4b";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(240_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("4B-form · the $18 charge detail and its assignment form", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    await page.getByRole("button", { name: /Financials — the financial work/ }).first().click();
    await page.waitForTimeout(9000);
    await page.getByRole("tab", { name: /^Charges$/ }).or(page.getByRole("button", { name: /^Charges$/ })).first().click({ timeout: 20_000 });
    await page.waitForTimeout(7000);

    // Posted holds 52; the awaiting-posting list of 9 does not contain this obligation.
    const posted = page.getByRole("tab", { name: /^Posted/ }).or(page.getByRole("button", { name: /^Posted/ })).first();
    log(`posted control count: ${await posted.count()}`);
    if (await posted.count()) { await posted.click({ timeout: 15_000 }); await page.waitForTimeout(6000); }
    const labels = await page.evaluate(() => Array.from(document.querySelectorAll("button"))
        .map((b) => (b as HTMLElement).innerText.trim().replace(/\s+/g, " "))
        .filter((x) => /Certhouse Family/.test(x)));
    log(`rows after Posted (${labels.length}):\n${labels.slice(0, 20).join("\n")}`);

    // Posted rows are labelled amount + date + grain + settlement — the charge TYPE is not in the
    // label, so the $18.00 obligation is found by its amount and confirmed once its detail opens.
    log(`ALL $18 rows: ${JSON.stringify(labels.filter((x) => /\$18\.00/.test(x)))}`);
    const row = page.getByRole("button", { name: /\$18\.00/ }).first();
    const n = await row.count();
    log(`consumable-fee row buttons: ${n}`);
    if (!n) { log("NOT REACHABLE FROM CHARGES TAB"); writeFileSync(`${OUT}/4b-form-unreachable.json`, JSON.stringify({ labels }, null, 2)); return; }
    await row.click({ timeout: 15_000 });
    await page.waitForTimeout(7000);
    await page.screenshot({ path: `${OUT}/4b-charge-detail-before.png` });

    const before = await page.evaluate(() => {
        const body = document.body.innerText || "";
        const i = body.indexOf("Manage responsibility");
        return {
            status: document.querySelector("[data-financials-charge-status]")?.getAttribute("data-financials-charge-status") ?? null,
            inForce: (document.querySelector('[data-financials-responsibility-arrangement="in-force"]') as HTMLElement | null)?.innerText ?? null,
            empty: (document.querySelector('[data-financials-responsibility-empty="true"]') as HTMLElement | null)?.innerText ?? null,
            block: i >= 0 ? body.slice(Math.max(0, i - 500), i + 300).replace(/\n+/g, " / ") : null,
        };
    });
    writeFileSync(`${OUT}/4b-charge-before.json`, JSON.stringify(before, null, 2));
    log(`BEFORE status=${before.status}`);
    log(`BEFORE inForce=${before.inForce}`);
    log(`BEFORE block: ${before.block}`);

    await page.locator('[data-financials-manage-responsibility="open"]').first().click({ timeout: 15_000 });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${OUT}/4b-form-open.png` });
    const form = await page.evaluate(() => {
        const txt = (e: Element) => (e as HTMLElement).innerText?.trim().replace(/\s+/g, " ").slice(0, 60) ?? "";
        return {
            inputs: Array.from(document.querySelectorAll("input")).map((i) => ({
                type: i.type, name: i.getAttribute("name") || i.getAttribute("data-testid") || i.getAttribute("placeholder") || "?", value: i.value,
            })),
            buttons: [...new Set(Array.from(document.querySelectorAll("button")).map(txt).filter(Boolean))].slice(0, 40),
            panelText: (document.querySelector('[data-financials-responsibility-panel], [data-financials-manage-responsibility="open"]')?.closest("div")?.parentElement as HTMLElement | null)?.innerText?.slice(0, 1200) ?? null,
        };
    });
    writeFileSync(`${OUT}/4b-form.json`, JSON.stringify(form, null, 2));
    log(`FORM inputs: ${JSON.stringify(form.inputs)}`);
    log(`FORM buttons: ${form.buttons.join(" | ")}`);
    log(`PANEL:\n${form.panelText}`);
});
