/**
 * FINANCIALS FINAL MOUNTED CERTIFICATION — STAGE A.
 *
 * Accounts host: the inner account product, the relationship row, and the three depth surfaces.
 * Read only. Nothing here commits a mutation.
 */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/final-mounted";
const ENTRY = "/workspace/work-unit/enrolled-children";

test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(900_000);
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
    await expect(tab, "the Accounts section tab").toHaveCount(1, { timeout: 60_000 });
    await tab.click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-detail='true']"), "the shared account surface").toHaveCount(1, { timeout: 120_000 });
    await page.waitForTimeout(6000);
}

const INVENTORY = () => {
    const q = (s: string) => document.querySelectorAll(s).length;
    const el = (s: string) => document.querySelector(s) as HTMLElement | null;
    const txt = (s: string) => { const e = el(s); return e ? e.innerText.replace(/\s+/g, " ").trim().slice(0, 300) : null; };
    const box = (s: string) => { const e = el(s); if (!e) return null; const r = e.getBoundingClientRect();
        return { top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), height: Math.round(r.height) }; };
    const root = el("[data-financials-detail='true']");
    return {
        detailRoot: q("[data-financials-detail='true']"),
        kpis: Array.from(document.querySelectorAll("[data-financials-line]")).map((e) => `${e.getAttribute("data-financials-line")}=${(e as HTMLElement).innerText.replace(/\s+/g, " ").trim()}`),
        rowGroups: { identity: q("[data-financials-row-group='identity']"), discount: q("[data-financials-row-group='discount']"), payment: q("[data-financials-row-group='payment']") },
        rowText: txt("[data-financials-payer-row='true']"),
        discountSummary: txt("[data-financials-discount-summary='true']"),
        discountGear: q("[data-financials-manage-discounts='gear']"),
        methodState: txt("[data-financials-method-state='true']"),
        managePayments: q("[data-financials-manage-payments='open']"),
        responsibilityGear: q("[data-financials-manage-responsibility='gear']"),
        responsibleFilter: q("[data-testid='financials-filter-responsible-party']"),
        lenses: txt("[data-financials-lenses='true']"),
        ledger: q("[data-financials-ledger='true']"),
        periods: Array.from(document.querySelectorAll("[data-financials-period]")).map((e) => e.getAttribute("data-financials-period")),
        paymentButton: q("[data-financials-command='payment.record'], [data-financials-actions='true']"),
        chargeMenu: q("[data-financials-charge-menu='true']"),
        boxes: {
            identity: box("[data-financials-row-group='identity']"),
            discount: box("[data-financials-row-group='discount']"),
            payment: box("[data-financials-row-group='payment']"),
            methodState: box("[data-financials-method-state='true']"),
            managePayments: box("[data-financials-manage-payments='open']"),
            row: box("[data-financials-payer-row='true']"),
            detail: box("[data-financials-detail='true']"),
        },
        /* §3 — the three permanent administration blocks must be GONE from the resting surface. */
        permanentResponsibilityBlock: q("[data-financials-entry='responsibility_admin'][data-financials-permanent], [data-financials-responsibility-block]"),
        permanentDiscountBlock: q("[data-financials-discount-position]"),
        permanentPaymentMethodsBlock: q("[data-financials-payment-methods]"),
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        rootScrollWidthOverflow: root ? root.scrollWidth > root.clientWidth + 1 : null,
        nativeFinancialControls: Array.from(document.querySelectorAll("select, input[type=number], input[type=date]"))
            .filter((e) => (e as HTMLElement).closest("[data-financials-detail='true'],[data-financials-overlay]") != null).length,
        prepaidNamed: /available prepaid/i.test(document.body.innerText),
    };
};

test("§2 §3 — the inner account product and the one relationship row", async ({ page }) => {
    await openAccounts(page);
    const inv = await page.evaluate(INVENTORY);
    log(`INVENTORY ${JSON.stringify(inv, null, 1)}`);
    save("A-accounts-inventory", inv);
    await shot(page, "C1-accounts-detail-1440");
    expect(inv.detailRoot, "the shared account surface is mounted").toBe(1);
    expect(inv.rowGroups.identity + inv.rowGroups.discount + inv.rowGroups.payment, "three groups, one row").toBe(3);
    expect(inv.horizontalOverflow, "no horizontal overflow").toBe(false);
});

async function openDepth(page: Page, gear: string, surface: string, name: string) {
    const t0 = Date.now();
    const g = page.locator(gear).first();
    await expect(g, `the ${name} control`).toHaveCount(1, { timeout: 60_000 });
    const accName = await g.getAttribute("aria-label");
    await g.click({ timeout: 20_000 });
    const shell = page.locator(surface).first();
    await expect(shell, `${name} opened`).toHaveCount(1, { timeout: 90_000 });
    const tShell = Date.now() - t0;
    await page.waitForTimeout(4000);
    const meaningful = Date.now() - t0;
    return { accName, tShell, meaningful };
}

test("§4 — Responsibility depth", async ({ page }) => {
    await openAccounts(page);
    const timing = await openDepth(page, "[data-financials-manage-responsibility='gear']", "[data-financials-overlay='responsibility_admin']", "Responsibility gear");
    const R = await page.evaluate(() => {
        const root = document.querySelector("[data-financials-overlay='responsibility_admin']") as HTMLElement | null;
        const r = root?.getBoundingClientRect();
        return {
            present: root != null,
            box: r ? { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) } : null,
            viewport: { w: window.innerWidth, h: window.innerHeight },
            text: root?.innerText.replace(/\s+/g, " ").trim().slice(0, 1500) ?? null,
            fixedPercentRemainder: ["Fixed", "Percentage", "Remainder"].filter((k) => new RegExp(k, "i").test(root?.innerText ?? "")),
            buttons: Array.from(root?.querySelectorAll("button") ?? []).map((b) => b.textContent?.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 25),
            avatars: root?.querySelectorAll("[data-identity-avatar], [data-card-avatar], img").length ?? 0,
            insideViewport: r ? r.top >= -1 && r.left >= -1 && r.bottom <= window.innerHeight + 1 && r.right <= window.innerWidth + 1 : null,
        };
    });
    log(`§4 RESPONSIBILITY ${JSON.stringify({ ...timing, ...R }, null, 1)}`);
    save("A-responsibility", { ...timing, ...R });
    await shot(page, "C2-responsibility-1440");
    // Escape closes only this layer; the account surface survives; focus returns to the gear.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(2500);
    const after = await page.evaluate(() => ({
        overlay: document.querySelectorAll("[data-financials-overlay='responsibility_admin']").length,
        detailAlive: document.querySelectorAll("[data-financials-detail='true']").length,
        focused: (document.activeElement as HTMLElement | null)?.getAttribute("data-financials-manage-responsibility") ?? (document.activeElement as HTMLElement | null)?.tagName ?? null,
    }));
    log(`§4 ESCAPE ${JSON.stringify(after)}`);
    save("A-responsibility-escape", after);
});
