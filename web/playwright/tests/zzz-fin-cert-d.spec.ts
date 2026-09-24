/** FINANCIALS FINAL MOUNTED CERTIFICATION — STAGE D: Add Charge preview truth, the Discount dropdown, the native control. No charge is confirmed. */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/final-mounted";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(1_200_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const save = (n: string, v: unknown) => { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/${n}.json`, JSON.stringify(v, null, 2)); };
const shot = async (p: Page, n: string) => { mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: `${OUT}/${n}.png` }); };

async function openAddCharge(page: Page) {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    expect(page.url(), "the governed QA session is live").not.toContain("/login");
    await page.locator("[data-adminv2-sidebar-modal-nav='financials']").first().click({ force: true, timeout: 20_000 });
    await page.waitForTimeout(10_000);
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-detail='true']")).toHaveCount(1, { timeout: 120_000 });
    await page.waitForTimeout(8000);
    await page.getByRole("button", { name: /^Add$/ }).first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-overlay='add_charge']")).toHaveCount(1, { timeout: 60_000 });
    await page.waitForTimeout(4000);
}

const PREVIEW = () => {
    const root = document.querySelector("[data-financials-overlay='add_charge']") as HTMLElement | null;
    if (!root) return { present: false } as Record<string, unknown>;
    const pv = root.querySelector("[data-financials-preview='true']") as HTMLElement | null;
    const text = root.innerText.replace(/\s+/g, " ").trim();
    return {
        present: true,
        full: text.slice(0, 2500),
        previewBlock: pv?.innerText.replace(/\s+/g, " ").trim().slice(0, 900) ?? null,
        ledgerInsidePreview: pv ? pv.querySelectorAll("[data-financials-ledger-row], [data-financials-period]").length : null,
        natives: Array.from(root.querySelectorAll("select,input[type=number],input[type=date],input[type=month]")).map((e) => ({
            tag: e.tagName, type: (e as HTMLInputElement).type ?? null,
            label: (e.closest("[class]")?.parentElement?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 60),
        })),
        discountControl: Array.from(root.querySelectorAll("button")).filter((b) => /discount/i.test(b.getAttribute("aria-label") || b.textContent || "")).map((b) => ({
            t: (b.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60), aria: b.getAttribute("aria-label"),
        })),
        appliesToValue: (Array.from(root.querySelectorAll("button")).find((b) => /household|child|certa|certb/i.test((b.textContent || "")))?.textContent || "").replace(/\s+/g, " ").trim(),
        afterPosting: (text.match(/AFTER POSTING\s*\$[\d,.]+/i) || [])[0] ?? null,
        currentBalance: (text.match(/Current balance\s*\$[\d,.]+/i) || [])[0] ?? null,
        chargeLine: (text.match(/\+\$[\d,.]+/) || [])[0] ?? null,
    };
};

test("§8 §9 — the preview's arithmetic, the Discount control and the native input", async ({ page }) => {
    await openAddCharge(page);
    const before = await page.evaluate(PREVIEW);
    log(`§9 BEFORE-DATE ${JSON.stringify(before, null, 1)}`);
    save("D-before-date", before);

    /* Fill the required service date — a form field, not a commit. */
    const date = page.locator("[data-financials-overlay='add_charge'] input[type='date']").first();
    if (await date.count()) { await date.fill("2026-09-30"); await page.waitForTimeout(4000); }
    const afterDate = await page.evaluate(PREVIEW);
    log(`§9 AFTER-DATE ${JSON.stringify(afterDate, null, 1)}`);
    save("D-after-date", afterDate);
    await shot(page, "C8-add-charge-dated-1440");

    /* Applies to → a child, which is the scope a discount can exist in. */
    const applies = page.getByRole("button", { name: /^Applies to$/ }).or(page.locator("[data-financials-overlay='add_charge']").getByRole("button", { name: /^Household/ })).first();
    if (await applies.count()) {
        await applies.click({ timeout: 20_000 });
        await page.waitForTimeout(2500);
        const opts = await page.evaluate(() => Array.from(document.querySelectorAll("[role='option']")).map((o) => (o as HTMLElement).innerText.replace(/\s+/g, " ").trim()));
        log(`§8 APPLIES-TO OPTIONS ${JSON.stringify(opts)}`);
        save("D-applies-to-options", opts);
        const child = page.getByRole("option", { name: /Certa|Certb|each child|per child/i }).first();
        if (await child.count()) { await child.click({ timeout: 20_000 }); await page.waitForTimeout(5000); }
        else await page.keyboard.press("Escape");
    }
    const withChild = await page.evaluate(PREVIEW);
    log(`§8 WITH-CHILD ${JSON.stringify(withChild, null, 1)}`);
    save("D-with-child", withChild);
    await shot(page, "C9-add-charge-child-1440");

    /* A discountable charge type, so the Discount dropdown has something to choose among. */
    const type = page.locator("[data-financials-overlay='add_charge']").getByRole("button", { name: /Field trip|Charge type/i }).first();
    if (await type.count()) {
        await type.click({ timeout: 20_000 });
        await page.waitForTimeout(2500);
        const types = await page.evaluate(() => Array.from(document.querySelectorAll("[role='option']")).map((o) => (o as HTMLElement).innerText.replace(/\s+/g, " ").trim()));
        log(`§8 CHARGE TYPES ${JSON.stringify(types)}`);
        save("D-charge-types", types);
        const tuition = page.getByRole("option", { name: /tuition/i }).first();
        if (await tuition.count()) { await tuition.click({ timeout: 20_000 }); await page.waitForTimeout(6000); }
        else await page.keyboard.press("Escape");
    }
    const discountable = await page.evaluate(PREVIEW);
    log(`§8 DISCOUNTABLE ${JSON.stringify(discountable, null, 1)}`);
    save("D-discountable", discountable);
    await shot(page, "C10-add-charge-discountable-1440");

    /* The Discount dropdown's own options. Nothing is confirmed. */
    const disc = page.locator("[data-financials-overlay='add_charge']").getByRole("button", { name: /discount/i }).first();
    if (await disc.count()) {
        await disc.click({ timeout: 20_000 });
        await page.waitForTimeout(2500);
        const opts = await page.evaluate(() => ({
            listbox: document.querySelectorAll("[role='listbox']").length,
            options: Array.from(document.querySelectorAll("[role='option']")).map((o) => ({ t: (o as HTMLElement).innerText.replace(/\s+/g, " ").trim(), sel: o.getAttribute("aria-selected") })),
        }));
        log(`§8 DISCOUNT OPTIONS ${JSON.stringify(opts, null, 1)}`);
        save("D-discount-options", opts);
        await shot(page, "C11-add-charge-discount-options");
        await page.keyboard.press("Escape");
        await page.waitForTimeout(1500);
    } else { log("§8 DISCOUNT CONTROL ABSENT"); save("D-discount-options", { absent: true }); }

    const final = await page.evaluate(PREVIEW);
    log(`§9 FINAL ${JSON.stringify(final, null, 1)}`);
    save("D-final", final);
    await shot(page, "C12-add-charge-final-1440");
    /* Leave without committing. */
    const cancel = page.locator("[data-financials-overlay='add_charge']").getByRole("button", { name: /^Cancel$/ }).first();
    if (await cancel.count()) await cancel.click({ timeout: 15_000 });
});
