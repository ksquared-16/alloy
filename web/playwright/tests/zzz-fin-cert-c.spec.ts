/** FINANCIALS FINAL MOUNTED CERTIFICATION — STAGE C: the discount options, and Add Charge at three widths. Read only; no charge is confirmed. */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/final-mounted";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com" });
test.describe.configure({ mode: "serial" });
test.setTimeout(1_200_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const save = (n: string, v: unknown) => { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/${n}.json`, JSON.stringify(v, null, 2)); };
const shot = async (p: Page, n: string) => { mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: `${OUT}/${n}.png` }); };

async function openAccounts(page: Page) {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    expect(page.url(), "the governed QA session is live").not.toContain("/login");
    const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
    await expect(nav).toHaveCount(1, { timeout: 60_000 });
    await nav.click({ force: true, timeout: 20_000 });
    await page.waitForTimeout(10_000);
    const tab = page.locator("[data-workspace-section-tab='accounts']").first();
    await expect(tab).toHaveCount(1, { timeout: 60_000 });
    await tab.click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-detail='true']")).toHaveCount(1, { timeout: 120_000 });
    await page.waitForTimeout(8000);
}

test("§5b — the Add Discount options are the child's configured discounts", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openAccounts(page);
    await page.locator("[data-financials-manage-discounts='gear']").first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-overlay='discount_admin']")).toHaveCount(1, { timeout: 90_000 });
    await page.waitForTimeout(4000);
    await page.getByRole("button", { name: /add discount/i }).first().click({ timeout: 20_000 });
    await page.waitForTimeout(3500);
    const chooser = page.getByRole("button", { name: /^Discount$/ }).first();
    await expect(chooser, "the Discount chooser").toHaveCount(1, { timeout: 30_000 });
    await chooser.click({ timeout: 20_000 });
    await page.waitForTimeout(2500);
    const R = await page.evaluate(() => {
        const opts = Array.from(document.querySelectorAll("[role='option']")).map((o) => ({
            t: (o as HTMLElement).innerText.replace(/\s+/g, " ").trim().slice(0, 120),
            selected: o.getAttribute("aria-selected"),
        }));
        const lb = document.querySelector("[role='listbox']") as HTMLElement | null;
        return { listbox: lb != null, listboxLabel: lb?.getAttribute("aria-label") ?? null, options: opts, optionCount: opts.length };
    });
    log(`§5b OPTIONS ${JSON.stringify(R, null, 1)}`);
    save("C-discount-options", R);
    await shot(page, "C6-discount-options-1440");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1500);
    const cancel = page.getByRole("button", { name: /^Cancel$/ }).first();
    if (await cancel.count()) await cancel.click({ timeout: 15_000 });
    await page.waitForTimeout(1500);
});

const CHARGE_READ = () => {
    const root = (document.querySelector("[data-financials-overlay='add_charge']")
        || document.querySelector("[data-financials-command='charge.add']")) as HTMLElement | null;
    if (!root) return { present: false } as Record<string, unknown>;
    const r = root.getBoundingClientRect();
    const text = root.innerText.replace(/\s+/g, " ").trim();
    const scroller = Array.from(root.querySelectorAll("*")).find((e) => (e as HTMLElement).scrollHeight > (e as HTMLElement).clientHeight + 4) as HTMLElement | null;
    const primary = Array.from(root.querySelectorAll("button")).find((b) => /^add charge$/i.test((b.textContent || "").trim()));
    const pr = primary?.getBoundingClientRect();
    return {
        present: true,
        box: { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height), bottom: Math.round(r.bottom) },
        contentHeight: Math.round(root.scrollHeight),
        viewport: { w: window.innerWidth, h: window.innerHeight },
        internalScroll: scroller ? Math.round(scroller.scrollHeight - scroller.clientHeight) : 0,
        cardTopToPrimary: pr ? Math.round(pr.top - r.top) : null,
        primaryInViewport: pr ? pr.bottom <= window.innerHeight + 1 : null,
        text: text.slice(0, 2200),
        chargeToOccurrences: (text.match(/Charge to/gi) || []).length,
        dividedBy: /divided by/i.test(text),
        responsibilityDuplicated: (text.match(/Responsib/gi) || []).length,
        nativeControls: root.querySelectorAll("select,input[type=number],input[type=date]").length,
        buttons: Array.from(root.querySelectorAll("button")).map((b) => (b.textContent || "").replace(/\s+/g, " ").trim().slice(0, 50)).filter(Boolean).slice(0, 40),
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        insideViewport: r.top >= -1 && r.left >= -1 && r.right <= window.innerWidth + 1,
    };
};

for (const width of [1280, 1440, 1680]) {
    test(`§8 §10 §11 — Add Charge at ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await openAccounts(page);
        const addBtn = page.getByRole("button", { name: /^Add$/ }).first();
        await expect(addBtn, "the Add control").toHaveCount(1, { timeout: 60_000 });
        await addBtn.click({ timeout: 20_000 });
        await page.waitForTimeout(3000);
        const menu = await page.evaluate(() => Array.from(document.querySelectorAll("[data-financials-charge-menu='true'] button, [role='menu'] button, [role='menuitem']"))
            .map((b) => (b as HTMLElement).innerText.replace(/\s+/g, " ").trim()).slice(0, 20));
        log(`§8 ADD MENU @${width} ${JSON.stringify(menu)}`);
        const charge = page.getByRole("button", { name: /^Charge$/ }).or(page.getByRole("menuitem", { name: /^Charge$/ })).first();
        if (await charge.count()) { await charge.click({ timeout: 20_000 }); await page.waitForTimeout(5000); }
        const R = await page.evaluate(CHARGE_READ);
        log(`§8 ADD CHARGE @${width} ${JSON.stringify(R, null, 1)}`);
        save(`C-add-charge-${width}`, { menu, ...R });
        await shot(page, `C7-add-charge-${width}`);
    });
}
