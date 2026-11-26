/** DEPLOYED PROOF — the Add Charge reduction sign. $400 gross, 10% sibling discount. Nothing is submitted. */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/sign-repair";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com" });
test.describe.configure({ mode: "serial" });
test.setTimeout(1_200_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const save = (n: string, v: unknown) => { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/${n}.json`, JSON.stringify(v, null, 2)); };

async function openAddCharge(page: Page) {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url(), "the governed QA session is live").not.toContain("/login");
    await page.locator("[data-adminv2-sidebar-modal-nav='financials']").first().click({ force: true, timeout: 20_000 });
    await page.waitForTimeout(11_000);
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-detail='true']")).toHaveCount(1, { timeout: 120_000 });
    await page.waitForTimeout(9000);
    await page.getByRole("button", { name: /^Add$/ }).first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-overlay='add_charge']")).toHaveCount(1, { timeout: 60_000 });
    await page.waitForTimeout(6000);
}
async function pick(page: Page, trigger: RegExp, option: RegExp, label: string) {
    const t = page.locator("[data-financials-overlay='add_charge'] button").filter({ hasText: trigger }).first();
    if (!(await t.count())) { log(`${label}: trigger absent`); return; }
    await t.click({ timeout: 20_000 });
    await page.waitForTimeout(2500);
    const o = page.locator("[role='option']").filter({ hasText: option }).first();
    if (await o.count()) { await o.click({ timeout: 20_000 }); await page.waitForTimeout(7000); }
    else { await page.keyboard.press("Escape"); log(`${label}: option not found`); }
}
const READ = () => {
    const root = document.querySelector("[data-financials-overlay='add_charge']") as HTMLElement | null;
    if (!root) return { present: false } as Record<string, unknown>;
    const text = root.innerText.replace(/\s+/g, " ").trim();
    const one = (s: string) => { const e = root.querySelector(s) as HTMLElement | null; return e ? e.innerText.replace(/\s+/g, " ").trim() : null; };
    const r = root.getBoundingClientRect();
    return {
        present: true,
        text: text.slice(0, 1500),
        gross: (text.match(/\+\$[\d,]+\.\d{2}/) || [])[0] ?? null,
        discountAmount: one("[data-addcharge-preview-discount-amount='true']"),
        netLine: one("[data-addcharge-preview-net='true']"),
        postedBalance: one("[data-addcharge-posted-balance='true']"),
        postingKind: (root.querySelector("[data-addcharge-posting]") as HTMLElement | null)?.getAttribute("data-addcharge-posting") ?? null,
        postingCopy: one("[data-addcharge-posting]"),
        chargeToCount: (text.match(/Charge to/gi) || []).length,
        doubleMinus: /--\$/.test(text),
        nativeDates: root.querySelectorAll("input[type=date]").length,
        alloyDates: root.querySelectorAll("[data-alloy-date-input='true']").length,
        nativeSelects: root.querySelectorAll("select, input[type=number]").length,
        discountSelector: Array.from(root.querySelectorAll("button")).filter((b) => /discount/i.test(b.getAttribute("aria-label") || "")).length,
        viewport: window.innerWidth,
        insideViewport: r.top >= -1 && r.right <= window.innerWidth + 1,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
};

for (const width of [1280, 1440, 1680]) {
    test(`$400 gross, 10% sibling discount at ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await openAddCharge(page);
        await pick(page, /^Household/, /Certa Certhouse/, "APPLIES TO");
        await pick(page, /^Field trip/, /Monthly tuition/, "CHARGE TYPE");
        const r = await page.evaluate(READ);
        log(`@${width} ${JSON.stringify(r, null, 1)}`);
        save(`preview-${width}`, r);
        mkdirSync(OUT, { recursive: true });
        await page.screenshot({ path: `${OUT}/S-add-charge-${width}.png` });

        expect(r.gross, "gross charge").toBe("+$400.00");
        expect(r.discountAmount, "the reduction, signed exactly once").toBe("-$40.00");
        expect(r.doubleMinus, "no doubled minus anywhere on the surface").toBe(false);
        expect(r.netLine, "net is gross PLUS the signed reduction").toBe("NET CHARGE $360.00");
        expect((r.text as string).includes("$440.00"), "the inverted net must be gone").toBe(false);
        expect(r.chargeToCount, "Charge to appears exactly once").toBe(1);
        expect(r.nativeDates, "no native date control").toBe(0);
        expect(r.nativeSelects, "no browser-blue financial-decision controls").toBe(0);
        expect(r.discountSelector, "the canonical Discount selector").toBe(1);
        expect(r.horizontalOverflow, "no horizontal overflow").toBe(false);
        /* Leave without submitting. */
        const cancel = page.locator("[data-financials-overlay='add_charge']").getByRole("button", { name: /^Cancel$/ }).first();
        if (await cancel.count()) await cancel.click({ timeout: 15_000 });
    });
}
