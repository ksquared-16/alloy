/**
 * 11B §24 — deployed staging smoke. Every surface the thread touched, on build 6c1b84fdc.
 *
 * This RECORDS what each surface answers. It marks no Human QA scenario PASS — that is Kelly's
 * act, and the catalog stands at zero by design.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11b-final";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("deployed smoke", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const smoke: Record<string, unknown> = { build: "6c1b84fdc", base: "https://staging.workwithalloy.com" };
    const flush = () => writeFileSync(`${OUT}/deployed-smoke.json`, JSON.stringify(smoke, null, 2));

    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(18_000);
    expect(page.url(), "an expired QA session redirects everything to /login").not.toContain("/login");

    /* FINAL FOCUS PANEL COMPOSITION — and the retirement, on the deployed build. */
    smoke.focusPanelComposition = await page.evaluate(() => ({
        cards: [...new Set(Array.from(document.querySelectorAll("[data-universal-card-key]")).map((e) => e.getAttribute("data-universal-card-key")))],
        billingPreviewRendered: Boolean(document.querySelector("[data-universal-card-key='billing_preview']")),
        financialsCard: Boolean(document.querySelector("[data-financials-card='true']")),
    }));
    log(`COMPOSITION: ${JSON.stringify(smoke.focusPanelComposition)}`);
    await page.screenshot({ path: `${OUT}/deployed-panel.png`, fullPage: true });
    flush();

    /* ASSIGNMENT COMMERCIAL SETUP + DISCOUNT FORECAST + UNIFIED ADD TARGET. */
    const child = page.getByRole("button", { name: /^custom/ }).first();
    if (await child.count()) {
        await child.click({ timeout: 20_000 }).catch(() => {});
        await page.waitForTimeout(14_000);
        smoke.assignment = await page.evaluate(() => {
            const t = (s: string) => document.querySelector(s)?.textContent?.trim() ?? null;
            return {
                tuitionSelect: Boolean(document.querySelector("select[data-assignment-tuition-embed='true']")),
                accepted: t("[data-assignment-tuition-recommended]"),
                billingFrequency: t("[data-assignment-billing-frequency]"),
                discountForecast: Boolean(document.querySelector("[data-assignment-discount-forecast]")),
                addException: Boolean(document.querySelector("[data-add-policy-exception]")),
                exceptionsListed: Array.from(document.querySelectorAll("[data-policy-exception]")).map((e) => e.textContent?.trim().slice(0, 120)),
                rejectedDiagnostics: document.querySelector("[data-assignment-tuition-rejected]")?.getAttribute("data-assignment-tuition-rejected") ?? null,
            };
        });
        log(`ASSIGNMENT: ${JSON.stringify(smoke.assignment)}`);
        await page.screenshot({ path: `${OUT}/deployed-assignment.png`, fullPage: true });
    }
    flush();

    /* THE READ ROUTES THIS THREAD ADDED OR CHANGED, authenticated this time. */
    smoke.routes = await page.evaluate(async () => {
        const hit = async (u: string) => {
            const r = await fetch(u, { credentials: "include" });
            const b = await r.json().catch(() => null);
            return { status: r.status, ok: r.ok, keys: b && typeof b === "object" ? Object.keys(b).slice(0, 8) : null, error: b?.error ?? null };
        };
        return {
            accountingCalendar: await hit("/api/admin/financials/accounting-calendar"),
            accounts: await hit("/api/admin/financials/accounts"),
        };
    });
    log(`ROUTES: ${JSON.stringify(smoke.routes)}`);
    flush();

    /* FINANCIALS WORKSPACE → ACCOUNTS (modal-dispatched; the sidebar needs force). */
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(1500);
    const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
    if (await nav.count()) {
        await nav.click({ force: true, timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(14_000);
        const tab = page.locator("[data-workspace-section-tab='accounts']").first();
        if (await tab.count()) { await tab.click({ timeout: 15_000 }).catch(() => {}); await page.waitForTimeout(14_000); }
        smoke.accounts = await page.evaluate(() => ({
            rows: document.querySelectorAll("[data-financials-account-row]").length,
            manageResponsibility: Boolean(document.querySelector("[data-financials-manage-responsibility]")),
            lenses: Array.from(document.querySelectorAll("[data-financials-lens]")).map((e) => e.getAttribute("data-financials-lens")),
        }));
        log(`ACCOUNTS: ${JSON.stringify(smoke.accounts)}`);
        await page.screenshot({ path: `${OUT}/deployed-accounts.png`, fullPage: true });
    }
    flush();

    /* ORGANIZATION CONFIGURATION, including the accounting calendar administration. */
    await page.goto("/organization/financials", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(14_000);
    smoke.organization = await page.evaluate(() => ({
        chapters: Array.from(document.querySelectorAll("h2,h3")).map((e) => e.textContent?.trim()).filter(Boolean).slice(0, 14),
        accountingCalendarPanel: Boolean(document.querySelector("[data-accounting-calendar]")),
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    }));
    log(`ORGANIZATION: ${JSON.stringify(smoke.organization)}`);
    await page.screenshot({ path: `${OUT}/deployed-organization.png`, fullPage: true });
    flush();
});
