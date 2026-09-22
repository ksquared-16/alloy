/** §§24-32 — scheduler truth, sanity, responsive at three widths, and keyboard. */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11c-slice3-mounted";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const save = (n: string, v: unknown) => { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/${n}.json`, JSON.stringify(v, null, 2)); };
const shot = async (p: Page, n: string) => { mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true }); };
async function reach(w: string, l: Locator, t = 30_000) { await expect(l, `§34 reached ${w}`).toHaveCount(1, { timeout: t }); }

async function openDetails(page: Page) {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url()).not.toContain("/login");
    const d = page.locator("[data-financials-card='true']").getByRole("button", { name: /^Details/ }).first();
    await reach("the Details door", d);
    await d.click({ timeout: 20_000 });
    await page.waitForTimeout(12_000);
    await reach("Financials Details", page.locator("[data-financials-payment-methods]").first());
}

test("§24 §25 §26 — scheduler truth and the non-regression sanity checks", async ({ page }) => {
    const R: Record<string, unknown> = {};
    await openDetails(page);

    /* §26 — slice 2 still intact on this build. */
    R.slice2 = await page.evaluate(() => {
        const t = document.body.innerText;
        return {
            availablePrepaid: (/Available prepaid\s*\$[\d,]+\.\d{2}/i.exec(t) || /AVAILABLE PREPAID\s*\$[\d,]+\.\d{2}/i.exec(t) || [null])[0],
            balance: (/Balance\s*\$[\d,]+\.\d{2}/i.exec(t) || /CURRENT BALANCE\s*\$[\d,]+\.\d{2}/i.exec(t) || [null])[0],
            responsibilityFilter: document.querySelectorAll('[data-testid="financials-filter-responsible-party"]').length,
            responsibilityGear: document.querySelectorAll('[data-financials-manage-responsibility="gear"]').length,
            paymentButton: Array.from(document.querySelectorAll("button")).filter((b) => /^Payment$/.test(b.textContent?.trim() ?? "")).length,
            addButton: Array.from(document.querySelectorAll("button")).filter((b) => /^Add$/.test(b.textContent?.trim() ?? "")).length,
            nativeSelects: document.querySelectorAll("select").length,
        };
    });
    log(`§26 SLICE-2 SANITY: ${JSON.stringify(R.slice2)}`);

    /* §24 — automation copy vs deployed truth, on the surfaces this slice touched. */
    R.automationCopy = await page.evaluate(() => {
        const t = document.body.innerText;
        return {
            claimsAutomatic: /automatically bill|bills automatically|runs automatically|next automatic|scheduled billing/i.test(t),
        };
    });
    await page.goto("/organization/financials", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(10_000);
    const tuition = page.getByRole("button", { name: /open tuition/i }).first();
    if (await tuition.count()) { await tuition.click({ timeout: 20_000 }); await page.waitForTimeout(10_000); }
    const freq = page.getByRole("link", { name: /billing frequenc/i }).first();
    if (await freq.count()) { await freq.click({ timeout: 15_000 }); await page.waitForTimeout(9000); }
    R.automationCopyBilling = await page.evaluate(() => ({
        claimsAutomatic: /automatically bill|bills automatically|runs automatically|next automatic|scheduled billing/i.test(document.body.innerText),
        accountingWordOnBilling: /accounting period/i.test(document.body.innerText),
    }));
    log(`§24 AUTOMATION: details=${JSON.stringify(R.automationCopy)} billing=${JSON.stringify(R.automationCopyBilling)}`);
    save("sanity", R);
});

test("§27 §28 §29 — responsive at 1280, 1440, 1680", async ({ page }) => {
    const R: Record<string, unknown> = {};
    for (const w of [1280, 1440, 1680]) {
        await page.setViewportSize({ width: w, height: 1050 });

        await openDetails(page);
        await reach("the Discount position", page.locator("[data-financials-discount-position]").first());
        const gear = page.locator('[data-financials-manage-discounts="gear"]').first();
        if (await gear.count()) { await gear.click({ timeout: 15_000 }); await page.waitForTimeout(7000); }
        R[`family-${w}`] = await page.evaluate(() => {
            const pos = document.querySelector("[data-financials-discount-position]") as HTMLElement | null;
            const mgmt = document.querySelector('[data-financials-manage-discounts="open-panel"]') as HTMLElement | null;
            const within = (el: HTMLElement | null) => {
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return { left: Math.round(r.left), right: Math.round(r.right), clipped: r.left < -1 || r.right > window.innerWidth + 1 };
            };
            return {
                position: within(pos), management: within(mgmt),
                horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
                overflowBy: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            };
        });
        log(`§2x family ${w}: ${JSON.stringify(R[`family-${w}`])}`);
        await shot(page, `A-family-discount-${w}`);
        await shot(page, `B-discount-management-${w}`);

        await page.goto("/organization/financials", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(10_000);
        const pol = page.getByRole("button", { name: /open policies/i }).first();
        if (await pol.count()) { await pol.click({ timeout: 20_000 }); await page.waitForTimeout(10_000); }
        R[`policies-${w}`] = await page.evaluate(() => ({
            rows: document.querySelectorAll("[data-testid^='policy-']").length,
            horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        }));
        log(`§2x policies ${w}: ${JSON.stringify(R[`policies-${w}`])}`);
        await shot(page, `C-policies-landing-${w}`);

        const tuition = page.getByRole("button", { name: /open tuition/i }).first();
        await page.goto("/organization/financials", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(9000);
        if (await tuition.count()) { await tuition.click({ timeout: 20_000 }); await page.waitForTimeout(9000); }
        const freq = page.getByRole("link", { name: /billing frequenc/i }).first();
        if (await freq.count()) { await freq.click({ timeout: 15_000 }); await page.waitForTimeout(9000); }
        R[`billing-${w}`] = await page.evaluate(() => ({
            rows: document.querySelectorAll("[data-testid^='billing-frequency-row-']").length,
            horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
            tableScrolls: Boolean(document.querySelector("table")?.parentElement
                && getComputedStyle(document.querySelector("table")!.parentElement!).overflowX !== "visible"),
        }));
        log(`§2x billing ${w}: ${JSON.stringify(R[`billing-${w}`])}`);
        await shot(page, `E-billing-frequencies-${w}`);
    }
    save("responsive", R);
});

test("§30 — discount accessibility, keyboard only", async ({ page }) => {
    const R: Record<string, unknown> = {};
    await openDetails(page);
    const gear = page.locator('[data-financials-manage-discounts="gear"]').first();
    await reach("the Discount gear", gear);
    R.accessibleName = await gear.getAttribute("aria-label");
    await gear.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(8000);
    await reach("Discount management", page.locator('[data-financials-manage-discounts="open-panel"]').first());
    R.openedWithEnter = true;
    R.focusInsidePanel = await page.evaluate(() =>
        Boolean(document.activeElement?.closest('[data-financials-manage-discounts="open-panel"]')));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(3500);
    R.afterEscape = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        return {
            panelClosed: document.querySelectorAll('[data-financials-manage-discounts="open-panel"]').length === 0,
            detailsSurvives: document.querySelectorAll("[data-financials-payment-methods]").length > 0,
            focus: a === document.body ? "BODY" : `${a?.tagName}("${a?.getAttribute("aria-label") ?? ""}")`,
        };
    });
    log(`§30 DISCOUNT A11Y: name=${R.accessibleName} focusInside=${R.focusInsidePanel} afterEscape=${JSON.stringify(R.afterEscape)}`);
    save("a11y-discounts", R);
});
