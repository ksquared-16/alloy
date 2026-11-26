/** FINANCIALS FINAL MOUNTED CERTIFICATION — STAGE B: Discounts and Payments depth. Read only. */
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
    await expect(tab).toHaveCount(1, { timeout: 60_000 });
    await tab.click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-detail='true']")).toHaveCount(1, { timeout: 120_000 });
    await page.waitForTimeout(8000);
}

const overlayRead = (sel: string) => {
    const root = document.querySelector(sel) as HTMLElement | null;
    const r = root?.getBoundingClientRect();
    return {
        present: root != null,
        box: r ? { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height), bottom: Math.round(r.bottom) } : null,
        viewport: { w: window.innerWidth, h: window.innerHeight },
        insideViewport: r ? r.top >= -1 && r.left >= -1 && r.bottom <= window.innerHeight + 1 && r.right <= window.innerWidth + 1 : null,
        text: root?.innerText.replace(/\s+/g, " ").trim().slice(0, 2000) ?? null,
        buttons: Array.from(root?.querySelectorAll("button") ?? []).map((b) => ({
            t: (b.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60),
            aria: b.getAttribute("aria-label"),
            role: b.getAttribute("role"),
        })).slice(0, 40),
        images: Array.from(root?.querySelectorAll("img") ?? []).map((i) => ({ alt: (i as HTMLImageElement).alt, hasSrc: Boolean((i as HTMLImageElement).src) })),
        avatarNodes: root?.querySelectorAll("[class*='avatar'],[data-identity-avatar],[data-card-avatar]").length ?? 0,
        nativeControls: root?.querySelectorAll("select,input[type=number],input[type=date]").length ?? 0,
        loadingTreatment: root?.querySelectorAll("[aria-busy='true'],[class*='animate-pulse']").length ?? 0,
    };
};

test("§5 §13 — Discounts depth, each child once, Add Discount discoverable", async ({ page }) => {
    await openAccounts(page);
    const t0 = Date.now();
    const gear = page.locator("[data-financials-manage-discounts='gear']").first();
    await expect(gear, "the Discount gear").toHaveCount(1, { timeout: 60_000 });
    const gearName = await gear.getAttribute("aria-label");
    await gear.click({ timeout: 20_000 });
    const shell = page.locator("[data-financials-overlay='discount_admin']").first();
    await expect(shell, "Discounts opened").toHaveCount(1, { timeout: 90_000 });
    const tShell = Date.now() - t0;
    await page.waitForTimeout(5000);
    const meaningful = Date.now() - t0;
    const R = await page.evaluate(overlayRead, "[data-financials-overlay='discount_admin']");
    log(`§5 DISCOUNTS ${JSON.stringify({ gearName, tShell, meaningful, ...R }, null, 1)}`);
    save("B-discounts", { gearName, tShell, meaningful, ...R });
    await shot(page, "C3-discounts-1440");

    /* Add Discount — exercised far enough to prove the child and the options, never committed. */
    const add = page.getByRole("button", { name: /add discount/i }).first();
    const addCount = await add.count();
    log(`§5 Add Discount controls: ${addCount}`);
    if (addCount) {
        await add.click({ timeout: 20_000 });
        await page.waitForTimeout(5000);
        const picker = await page.evaluate(overlayRead, "[data-financials-overlay='discount_admin']");
        log(`§5 ADD-DISCOUNT ${JSON.stringify(picker, null, 1)}`);
        save("B-add-discount", picker);
        await shot(page, "C4-add-discount-1440");
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(2500);
    const esc = await page.evaluate(() => ({
        overlay: document.querySelectorAll("[data-financials-overlay='discount_admin']").length,
        detailAlive: document.querySelectorAll("[data-financials-detail='true']").length,
        focused: (document.activeElement as HTMLElement | null)?.getAttribute("data-financials-manage-discounts") ?? (document.activeElement as HTMLElement | null)?.tagName ?? null,
    }));
    log(`§5 ESCAPE ${JSON.stringify(esc)}`);
    save("B-discounts-escape", esc);
});

test("§6 §13 — Payments depth", async ({ page }) => {
    await openAccounts(page);
    const t0 = Date.now();
    const open = page.locator("[data-financials-manage-payments='open']").first();
    await expect(open, "Manage payments").toHaveCount(1, { timeout: 60_000 });
    const name = await open.getAttribute("aria-label");
    await open.click({ timeout: 20_000 });
    const shell = page.locator("[data-financials-overlay='payments_admin']").first();
    await expect(shell, "Payments opened").toHaveCount(1, { timeout: 90_000 });
    const tShell = Date.now() - t0;
    await page.waitForTimeout(5000);
    const meaningful = Date.now() - t0;
    const R = await page.evaluate(overlayRead, "[data-financials-overlay='payments_admin']");
    log(`§6 PAYMENTS ${JSON.stringify({ name, tShell, meaningful, ...R }, null, 1)}`);
    save("B-payments", { name, tShell, meaningful, ...R });
    await shot(page, "C5-payments-1440");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(2500);
    const esc = await page.evaluate(() => ({
        overlay: document.querySelectorAll("[data-financials-overlay='payments_admin']").length,
        detailAlive: document.querySelectorAll("[data-financials-detail='true']").length,
        focused: (document.activeElement as HTMLElement | null)?.getAttribute("data-financials-manage-payments") ?? (document.activeElement as HTMLElement | null)?.tagName ?? null,
    }));
    log(`§6 ESCAPE ${JSON.stringify(esc)}`);
    save("B-payments-escape", esc);
});
