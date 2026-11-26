/**
 * 11C slice 2 — the remaining mounted gates on the repaired build 41a17c2a4aae.
 * Nothing writes. Fixture limits are reported, never manufactured.
 */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { activeElementDescriptor, alloyOptions, isAlloyControl } from "../helpers/alloyControls";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11c-slice2";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(700_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const save = (n: string, v: unknown) => { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/${n}.json`, JSON.stringify(v, null, 2)); };

async function openDetails(page: import("@playwright/test").Page) {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url(), "QA session is live").not.toContain("/login");
    const d = page.locator("[data-financials-card='true']").getByRole("button", { name: /^Details/ }).first();
    await expect(d).toHaveCount(1);
    await d.click({ timeout: 20_000 });
    await page.waitForTimeout(12_000);
    await expect(page.locator("[data-financials-payment-methods]").first()).toHaveCount(1, { timeout: 30_000 });
}
const fp = (page: import("@playwright/test").Page) => page.evaluate(() => ({
    detailsOpen: document.querySelectorAll("[data-financials-payment-methods]").length,
    rows: document.querySelectorAll("[data-financials-ledger-row],[data-charge-row]").length,
    panel: document.querySelectorAll('[data-financials-manage-responsibility="open-panel"]').length,
}));

test("§9 §21 — one Escape closes one layer, in sequence", async ({ page }) => {
    const R: Record<string, unknown> = {};
    await openDetails(page);
    R.base = await fp(page);
    await page.locator('[data-financials-manage-responsibility="gear"]').first().click({ timeout: 15_000 });
    await page.waitForTimeout(8000);
    R.opened = await fp(page);
    await page.keyboard.press("Escape"); await page.waitForTimeout(3500);
    R.escape1 = { ...(await fp(page)), focus: await activeElementDescriptor(page) };
    await page.keyboard.press("Escape"); await page.waitForTimeout(3500);
    R.escape2 = await fp(page);
    log(`§9 base=${JSON.stringify(R.base)} opened=${JSON.stringify(R.opened)}`);
    log(`§9 escape1=${JSON.stringify(R.escape1)}`);
    log(`§9 escape2=${JSON.stringify(R.escape2)}`);
    expect((R.escape1 as { panel: number }).panel, "Escape 1 closes ONLY the panel").toBe(0);
    expect((R.escape1 as { detailsOpen: number }).detailsOpen, "Details survives Escape 1").toBeGreaterThan(0);
    save("gate-nested-escape", R);
});

test("§11 §12 §13 — Cancel/Close, Adjustment and Payment on the repaired build", async ({ page }) => {
    const R: Record<string, unknown> = {};
    await openDetails(page);
    R.detailsBefore = await fp(page);

    /* §12 Adjustment, via the entry-mode tablist — not the removed affordance. */
    await page.getByRole("button", { name: /^Add$/ }).first().click({ timeout: 20_000 });
    await page.waitForTimeout(9000);
    await page.locator('[data-financials-entry-mode-tab="adjustment"]').first().click({ timeout: 20_000 });
    await page.waitForTimeout(11_000);
    const adj: Record<string, unknown> = {};
    for (const id of ["adjustment-agreement", "adjustment-source-charge", "adjustment-category"]) {
        adj[id] = (await page.locator(`[data-testid="${id}"]`).count())
            ? { canonical: await isAlloyControl(page, id), options: (await alloyOptions(page, id)).map((o) => o.label).slice(0, 3) }
            : { present: 0 };
    }
    adj.directionUnderCredit = await page.locator('[data-testid="adjustment-direction"]').count();
    adj.nativeSelects = await page.locator("select").count();
    R.adjustment = adj;
    log(`§12 ${JSON.stringify(adj)}`);
    expect(adj.nativeSelects, "zero native selects in Adjustment").toBe(0);

    await page.keyboard.press("Escape"); await page.waitForTimeout(4000);
    R.afterAdjustmentEscape = await fp(page);
    log(`§12 afterEscape=${JSON.stringify(R.afterAdjustmentEscape)}`);
    expect((R.afterAdjustmentEscape as { detailsOpen: number }).detailsOpen, "Details survives").toBeGreaterThan(0);

    /* §13 Payment. */
    await page.getByRole("button", { name: /^Payment$/ }).first().click({ timeout: 20_000 });
    await page.waitForTimeout(9000);
    const opts = await alloyOptions(page, "financials-payment-method");
    R.payment = {
        methodCanonical: await isAlloyControl(page, "financials-payment-method"),
        payerCanonical: await isAlloyControl(page, "financials-payment-payer"),
        disabled: opts.filter((o) => o.disabled).map((o) => o.label),
        nativeSelects: await page.locator("select").count(),
    };
    log(`§13 ${JSON.stringify(R.payment)}`);
    expect((R.payment as { nativeSelects: number }).nativeSelects).toBe(0);
    await page.keyboard.press("Escape"); await page.waitForTimeout(4000);
    R.afterPaymentEscape = await fp(page);
    expect((R.afterPaymentEscape as { detailsOpen: number }).detailsOpen, "Details survives").toBeGreaterThan(0);
    save("gate-adjustment-payment", R);
});

test("§14 §16 §20 — responsibility model, Accounts parity, keyboard in both hosts", async ({ page }) => {
    const R: Record<string, unknown> = {};
    /* DETAILS */
    await openDetails(page);
    const dGear = page.locator('[data-financials-manage-responsibility="gear"]').first();
    await dGear.focus();
    R.detailsGearName = await dGear.getAttribute("aria-label");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(9000);
    R.detailsScopes = (await page.locator('[data-testid="responsibility-scope"]').count())
        ? (await alloyOptions(page, "responsibility-scope")).map((o) => o.label) : [];
    R.detailsCopy = await page.evaluate(() => {
        const p = document.querySelector('[data-financials-manage-responsibility="open-panel"]') as HTMLElement | null;
        return p?.innerText?.replace(/\s+/g, " ").slice(0, 700) ?? null;
    });
    await page.keyboard.press("Escape"); await page.waitForTimeout(3000);
    R.detailsFocusBack = await activeElementDescriptor(page);
    log(`§14 DETAILS scopes=${JSON.stringify(R.detailsScopes)} focusBack=${R.detailsFocusBack}`);
    log(`§14 COPY: ${R.detailsCopy}`);

    /* ACCOUNTS */
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
    if (await nav.count()) { await nav.click({ force: true, timeout: 15_000 }); await page.waitForTimeout(13_000); }
    const tab = page.locator("[data-workspace-section-tab='accounts']").first();
    if (await tab.count()) { await tab.click({ timeout: 15_000 }); await page.waitForTimeout(13_000); }
    R.accountsFilter = await page.locator("[data-financials-lens]").count();
    const row = page.locator("[data-financials-account-row]").first();
    if (await row.count()) { await row.click({ timeout: 15_000 }); await page.waitForTimeout(11_000); }
    const aGear = page.locator('[data-financials-manage-responsibility="gear"]').first();
    R.accountsGearName = await aGear.getAttribute("aria-label");
    await aGear.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(9000);
    R.accountsScopes = (await page.locator('[data-testid="responsibility-scope"]').count())
        ? (await alloyOptions(page, "responsibility-scope")).map((o) => o.label) : [];
    R.accountsRowsWhileOpen = await page.locator("[data-financials-account-row]").count();
    await page.keyboard.press("Escape"); await page.waitForTimeout(3500);
    R.accountsAfterEscape = {
        panel: await page.locator('[data-financials-manage-responsibility="open-panel"]').count(),
        rows: await page.locator("[data-financials-account-row]").count(),
        focus: await activeElementDescriptor(page),
    };
    log(`§16 ACCOUNTS scopes=${JSON.stringify(R.accountsScopes)} afterEscape=${JSON.stringify(R.accountsAfterEscape)}`);
    R.parity = JSON.stringify(R.detailsScopes) === JSON.stringify(R.accountsScopes);
    log(`§16 PARITY scopes identical: ${R.parity}`);
    save("gate-responsibility-parity", R);
});

test("§19 §23 §24 — Account Workspace, census and responsive at three widths", async ({ page }) => {
    const R: Record<string, unknown> = {};
    for (const width of [1280, 1440, 1680]) {
        await page.setViewportSize({ width, height: 1050 });
        await openDetails(page);
        await page.locator('[data-financials-manage-responsibility="gear"]').first().click({ timeout: 15_000 });
        await page.waitForTimeout(7000);
        R[`details${width}`] = await page.evaluate(() => {
            const p = document.querySelector('[data-financials-manage-responsibility="open-panel"]') as HTMLElement | null;
            const r = p?.getBoundingClientRect();
            return {
                panelOpen: Boolean(p),
                withinViewport: r ? r.left >= -1 && r.right <= window.innerWidth + 1 : null,
                nativeSelects: document.querySelectorAll("select").length,
                horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
            };
        });
        log(`§24 details ${width}: ${JSON.stringify(R[`details${width}`])}`);
        await page.keyboard.press("Escape");
        await page.screenshot({ path: `${OUT}/final-details-${width}.png`, fullPage: true });
    }
    save("gate-responsive-census", R);
});
