/** FINAL REMOUNT — the four repairs on deployed. Read only; no mutation is confirmed. */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/final-remount";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(1_200_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const save = (n: string, v: unknown) => { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/${n}.json`, JSON.stringify(v, null, 2)); };
const shot = async (p: Page, n: string) => { mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: `${OUT}/${n}.png` }); };

async function openAccounts(page: Page) {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url(), "the governed QA session is live").not.toContain("/login");
    await page.locator("[data-adminv2-sidebar-modal-nav='financials']").first().click({ force: true, timeout: 20_000 });
    await page.waitForTimeout(11_000);
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-detail='true']")).toHaveCount(1, { timeout: 120_000 });
    await page.waitForTimeout(9000);
}
const READ = (sel: string) => {
    const root = document.querySelector(sel) as HTMLElement | null;
    if (!root) return { present: false } as Record<string, unknown>;
    const r = root.getBoundingClientRect();
    return {
        present: true,
        box: { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height), bottom: Math.round(r.bottom) },
        insideViewport: r.top >= -1 && r.bottom <= window.innerHeight + 1 && r.right <= window.innerWidth + 1,
        text: root.innerText.replace(/\s+/g, " ").trim().slice(0, 1600),
        nativeDates: root.querySelectorAll("input[type=date]").length,
        alloyDates: root.querySelectorAll("[data-alloy-date-input='true']").length,
        buttons: Array.from(root.querySelectorAll("button")).map((b) => (b.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 25),
        avatars: root.querySelectorAll("[class*='avatar']").length,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
};

test("§11 — Responsibility: canonical date control and validation that names the missing input", async ({ page }) => {
    await openAccounts(page);
    await page.locator("[data-financials-manage-responsibility='gear']").first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-overlay='responsibility_admin']")).toHaveCount(1, { timeout: 90_000 });
    await page.waitForTimeout(6000);
    const r = await page.evaluate(READ, "[data-financials-overlay='responsibility_admin']");
    log(`§11 RESPONSIBILITY ${JSON.stringify(r, null, 1)}`);
    save("B-responsibility", r);
    await shot(page, "M4-responsibility");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(2500);
});

test("§12 — Discounts and Payments narrow recheck", async ({ page }) => {
    await openAccounts(page);
    await page.locator("[data-financials-manage-discounts='gear']").first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-overlay='discount_admin']")).toHaveCount(1, { timeout: 90_000 });
    await page.waitForTimeout(6000);
    const d = await page.evaluate(READ, "[data-financials-overlay='discount_admin']");
    log(`§12 DISCOUNTS ${JSON.stringify(d, null, 1)}`);
    save("B-discounts", d);
    await shot(page, "M5-discounts");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(3000);
    await page.locator("[data-financials-manage-payments='open']").first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-overlay='payments_admin']")).toHaveCount(1, { timeout: 90_000 });
    await page.waitForTimeout(5000);
    const p = await page.evaluate(READ, "[data-financials-overlay='payments_admin']");
    log(`§12 PAYMENTS ${JSON.stringify(p, null, 1)}`);
    save("B-payments", p);
    await shot(page, "M6-payments");
});

test("§13 §14 — Add Charge preview and the Adjustment date", async ({ page }) => {
    await openAccounts(page);
    await page.getByRole("button", { name: /^Add$/ }).first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-overlay='add_charge']")).toHaveCount(1, { timeout: 60_000 });
    await page.waitForTimeout(6000);
    const initial = await page.evaluate(READ, "[data-financials-overlay='add_charge']");
    log(`§13 ADD CHARGE (household) ${JSON.stringify({ nativeDates: initial.nativeDates, alloyDates: initial.alloyDates, text: (initial.text as string).slice(0, 500) }, null, 1)}`);
    save("B-add-charge-initial", initial);

    /* Drive to a discountable child charge — a preview only; Confirm is never pressed. */
    const applies = page.locator("[data-financials-overlay='add_charge']").getByRole("button", { name: /^Household/ }).first();
    if (await applies.count()) {
        await applies.click({ timeout: 20_000 });
        await page.waitForTimeout(2500);
        const child = page.getByRole("option", { name: /Certa|Certb/i }).first();
        if (await child.count()) { await child.click({ timeout: 20_000 }); await page.waitForTimeout(6000); }
    }
    const type = page.locator("[data-financials-overlay='add_charge']").getByRole("button", { name: /Field trip|Monthly tuition/i }).first();
    if (await type.count()) {
        await type.click({ timeout: 20_000 });
        await page.waitForTimeout(2500);
        const tuition = page.getByRole("option", { name: /monthly tuition/i }).first();
        if (await tuition.count()) { await tuition.click({ timeout: 20_000 }); await page.waitForTimeout(7000); }
    }
    const preview = await page.evaluate(READ, "[data-financials-overlay='add_charge']");
    log(`§13 ADD CHARGE (discountable) ${JSON.stringify(preview, null, 1)}`);
    save("B-add-charge-preview", preview);
    await shot(page, "M7-add-charge-preview");
    /* Leave without committing. */
    const cancel = page.locator("[data-financials-overlay='add_charge']").getByRole("button", { name: /^Cancel$/ }).first();
    if (await cancel.count()) await cancel.click({ timeout: 15_000 });
    await page.waitForTimeout(3000);

    /* §14 Adjustment. */
    await page.getByRole("button", { name: /^Add$/ }).first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-overlay='add_charge']")).toHaveCount(1, { timeout: 60_000 });
    await page.waitForTimeout(5000);
    const adj = page.locator("[data-financials-overlay='add_charge'] button").filter({ hasText: /^Adjustment$/ }).first();
    await adj.click({ timeout: 20_000 });
    await page.waitForTimeout(6000);
    const a = await page.evaluate(READ, "[data-financials-overlay='add_charge']");
    log(`§14 ADJUSTMENT ${JSON.stringify({ nativeDates: a.nativeDates, alloyDates: a.alloyDates, text: (a.text as string).slice(0, 600) }, null, 1)}`);
    save("B-adjustment", a);
    await shot(page, "M8-adjustment");
});

test("§15 §16 — periodic billing smoke and responsive sanity", async ({ page }) => {
    await page.goto("/adminV2", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    expect(page.url()).not.toContain("/login");
    const pb = await page.evaluate(async () => {
        const r = await fetch("/api/admin/financials/periodic-billing-status", { credentials: "include" });
        return { status: r.status, json: await r.json().catch(() => null) };
    });
    log(`§15 PERIODIC BILLING ${JSON.stringify(pb)}`);
    save("B-periodic-billing", pb);

    const widths: Record<string, unknown>[] = [];
    for (const width of [1280, 1440, 1680]) {
        await page.setViewportSize({ width, height: 900 });
        await openAccounts(page);
        const r = await page.evaluate(() => {
            const floor = document.querySelector('[data-financials-surface-role="floor"]') as HTMLElement | null;
            const b = floor?.getBoundingClientRect();
            const clipped = Array.from(document.querySelectorAll("[data-financials-detail='true'] *"))
                .filter((e) => { const cs = getComputedStyle(e); return cs.overflow === "hidden" && (e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth + 4; }).length;
            return {
                viewport: window.innerWidth,
                floor: b ? { left: Math.round(b.left), width: Math.round(b.width), right: Math.round(b.right) } : null,
                backdrop: (document.querySelector(".alloy-accounts-command-backdrop") as HTMLElement | null)
                    ? getComputedStyle(document.querySelector(".alloy-accounts-command-backdrop")!).display : "absent",
                rows: document.querySelectorAll("[data-financials-account-row]").length,
                horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
                clippedNodes: clipped,
            };
        });
        log(`§16 @${width} ${JSON.stringify(r)}`);
        widths.push(r);
        await shot(page, `M9-accounts-${width}`);
    }
    save("B-responsive", widths);
});
