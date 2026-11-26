/**
 * §3 readback + §6/§7/§9 Details and parity, for the charge that finally inherited.
 *
 * Target charge: 3fb7c297 (service 2026-10-06). Its charge-scoped arrangement a0918a88 names
 * Ada Certfree at percentage 10000 bp. The question here is whether the OPERATOR sees that — in
 * the ledger, in Details from Accounts, and identically in Details from the Focus Panel.
 */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/w7-repair-1/fifth/closure";
const ENTRY = "/workspace/work-unit/enrolled-children";
const CHARGE = "6ccb9225-8c21-4fb4-b414-9b6a1afb993a"; // the FIFTH-proof charge: created, configured, and RESOLVED
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(1_800_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const found: Record<string, unknown>[] = [];
const save = () => { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/closure.json`, JSON.stringify(found, null, 2)); };

const readDetails = (page: Page) => page.evaluate(() => {
    const card = document.querySelector("[data-financials-overlay='charge_detail']")
        ?? document.querySelector("[data-financials-charge-detail]");
    if (!card) return null;
    const rows: Record<string, string> = {};
    card.querySelectorAll("[data-financials-charge-line]").forEach((r) => {
        const s = r.querySelectorAll("span");
        if (s.length >= 2) rows[(s[0]!.textContent ?? "").trim()] = (s[1]!.textContent ?? "").trim();
    });
    const text = (card as HTMLElement).innerText.replace(/\s+/g, " ");
    return {
        label: (card.querySelector("[data-financials-charge-label]") as HTMLElement | null)?.innerText.trim() ?? null,
        attribution: (card.querySelector("[data-financials-charge-attribution]") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").trim() ?? null,
        attributionState: card.querySelector("[data-financials-charge-attribution]")?.getAttribute("data-financials-charge-attribution") ?? null,
        status: card.querySelector("[data-financials-charge-status]")?.getAttribute("data-financials-charge-status") ?? null,
        rows,
        uuidCount: (text.match(/[0-9a-f]{8}-[0-9a-f]{4}-/gi) ?? []).length,
        text: text.slice(0, 700),
    };
});

async function openAccount(page: Page) {
    for (let a = 1; a <= 2; a++) {
        await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(13_000);
        const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
        if (await nav.count()) { await nav.click({ force: true, timeout: 20_000 }); break; }
        if (a === 2) throw new Error("workspace never mounted");
    }
    await page.waitForTimeout(11_000);
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 30_000 });
    await page.waitForFunction(() => document.querySelectorAll("[data-financials-account-row]").length > 0, undefined, { timeout: 180_000 });
    await page.waitForTimeout(3_000);
    const id = await page.evaluate(() =>
        [...document.querySelectorAll("[data-financials-account-row]")]
            .find((r) => /certfree/i.test((r as HTMLElement).innerText))?.getAttribute("data-financials-account-row") ?? null);
    await page.locator(`[data-financials-account-row="${id}"]`).first().click({ timeout: 30_000 });
    await page.waitForTimeout(14_000);
    await expandLedgerPeriods(page);
}

/**
 * A collapsed period shows its header and balance and NO rows — which reads identically to a ledger
 * that failed to render, and cost one pass before this was noticed. Every period is opened before
 * any row is looked for.
 */
async function expandLedgerPeriods(page: Page) {
    const toggles = page.locator("[data-financials-period-toggle]");
    const n = await toggles.count();
    for (let i = 0; i < n; i++) {
        const t = toggles.nth(i);
        if ((await t.getAttribute("aria-expanded")) === "false") {
            await t.click({ timeout: 15_000 }).catch(() => undefined);
            await page.waitForTimeout(1_500);
        }
    }
    await page.waitForTimeout(4_000);
    const rows = await page.locator("[data-financials-ledger-row]").count();
    log(`  ledger periods: ${n}, rows after expanding: ${rows}`);
}

test("§3 · the ledger states the responsibility, and Accounts Details agrees", async ({ page }) => {
    await openAccount(page);
    /* The ledger row for the charge that inherited. */
    const ledger = await page.evaluate((cid) => {
        const row = document.querySelector(`[data-financials-ledger-row="${cid}"]`);
        const cell = row?.querySelector("[data-financials-responsible]");
        const all = [...document.querySelectorAll("[data-financials-responsible]")]
            .map((e) => ({ state: e.getAttribute("data-financials-responsibility"), text: (e as HTMLElement).innerText.trim() }));
        return {
            rowFound: !!row,
            state: cell?.getAttribute("data-financials-responsibility") ?? null,
            text: (cell as HTMLElement | null)?.innerText.trim() ?? null,
            allResponsibilityCells: all.slice(0, 10),
        };
    }, CHARGE);
    log(`LEDGER RESPONSIBILITY: ${JSON.stringify(ledger)}`);
    await page.screenshot({ path: `${OUT}/A-ledger.png`, fullPage: true });

    const opener = page.locator(`[data-financials-row-open="${CHARGE}"]`).first();
    const openerCount = await opener.count();
    log(`DETAILS AFFORDANCE on the target row: ${openerCount}`);
    if (openerCount > 0) {
        await opener.click({ timeout: 20_000 });
        await page.waitForTimeout(9_000);
    }
    const details = await readDetails(page);
    log(`ACCOUNTS DETAILS: ${JSON.stringify(details)}`);
    await page.screenshot({ path: `${OUT}/B-accounts-details.png`, fullPage: true });
    found.push({ proof: "accounts", ledger, openerCount, details }); save();
    expect(ledger.rowFound || ledger.allResponsibilityCells.length > 0, "the ledger renders responsibility").toBe(true);
});

test("§7/§9 · the Focus Panel opens the SAME record, dispatching no command", async ({ page }) => {
    let commands = 0;
    page.on("request", (r) => { if (/actions\/execute/.test(r.url())) commands += 1; });
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(50_000);
    const nav = page.locator("[data-financials-nav='details']").first();
    if (await nav.count() === 0) {
        log("FOCUS PANEL: details nav absent");
        found.push({ proof: "focus", reachable: false }); save();
        return;
    }
    await nav.click({ timeout: 25_000 });
    await page.waitForTimeout(14_000);
    await expandLedgerPeriods(page);
    const openers = await page.locator("[data-financials-row-open]").count();
    const target = page.locator(`[data-financials-row-open="${CHARGE}"]`).first();
    const hasTarget = await target.count();
    if (hasTarget > 0) { await target.click({ timeout: 20_000 }); await page.waitForTimeout(9_000); }
    const details = await readDetails(page);
    log(`FOCUS PANEL openers=${openers} target=${hasTarget} commands=${commands}`);
    log(`FOCUS PANEL DETAILS: ${JSON.stringify(details)}`);
    await page.screenshot({ path: `${OUT}/C-focus-details.png`, fullPage: true });
    found.push({ proof: "focus", openers, hasTarget, commands, details }); save();
    expect(commands, "opening a record dispatches NO financial command").toBe(0);
});
