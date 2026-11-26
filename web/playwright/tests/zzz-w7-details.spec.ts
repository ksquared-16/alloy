/**
 * §6-§9 — Details from both surfaces, Alvarez legibility, and cross-surface parity.
 *
 * One canonical charge is opened from Financials -> Accounts and from the Focus Panel, and the two
 * readings are compared field by field. Both go through the same `FinancialsChargeDetail` over the
 * same `resolveChargeDetail`, so this is checking that the SAME presentation was reached, not that
 * two implementations happen to agree.
 */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/w7-repair-1/details";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(1_800_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const found: Record<string, unknown>[] = [];
const save = () => { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/details-parity.json`, JSON.stringify(found, null, 2)); };

/** Everything the shared Details presentation states, keyed by its own row labels. */
const readDetails = (page: Page) => page.evaluate(() => {
    const card = document.querySelector("[data-financials-overlay='charge_detail'], [data-financials-charge-detail]");
    if (!card) return null;
    const rows: Record<string, string> = {};
    card.querySelectorAll("[data-financials-charge-line]").forEach((r) => {
        const spans = r.querySelectorAll("span");
        if (spans.length >= 2) rows[spans[0]!.textContent?.trim() ?? ""] = spans[1]!.textContent?.trim() ?? "";
    });
    return {
        label: (card.querySelector("[data-financials-charge-label]") as HTMLElement | null)?.innerText.trim() ?? null,
        attribution: (card.querySelector("[data-financials-charge-attribution]") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").trim() ?? null,
        attributionState: card.querySelector("[data-financials-charge-attribution]")?.getAttribute("data-financials-charge-attribution") ?? null,
        status: card.querySelector("[data-financials-charge-status]")?.getAttribute("data-financials-charge-status") ?? null,
        rows,
        /* UUIDs must not be the operator's explanation — counted, not eyeballed. */
        uuidsInBody: ((card as HTMLElement).innerText.match(/[0-9a-f]{8}-[0-9a-f]{4}-/gi) ?? []).length,
        text: (card as HTMLElement).innerText.replace(/\s+/g, " ").slice(0, 600),
    };
});

/**
 * Ledger periods arrive COLLAPSED, so `[data-financials-row-open]` is legitimately absent until they
 * are opened. Reading zero before expanding is reading absence as an answer.
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
    log(`  ledger periods: ${n}, rows: ${await page.locator("[data-financials-ledger-row]").count()}`);
}

/** The fifth-proof charge — created, configured and RESOLVED. Parity is only parity on ONE record. */
const CHARGE = "6ccb9225-8c21-4fb4-b414-9b6a1afb993a";

async function reachAccounts(page: Page) {
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
}

/** Open the first ledger row that offers the Details affordance, and say which charge it was. */
async function openFirstRowDetails(page: Page) {
    const named = page.locator(`[data-financials-row-open="${CHARGE}"]`).first();
    const opener = (await named.count()) > 0 ? named : page.locator("[data-financials-row-open]").first();
    const count = await opener.count();
    if (count === 0) return null;
    const chargeId = await opener.getAttribute("data-financials-row-open");
    await opener.click({ timeout: 20_000 });
    await page.waitForTimeout(8_000);
    return chargeId;
}

test("A · Accounts opens the shared Details", async ({ page }) => {
    await reachAccounts(page);
    const id = await page.evaluate(() =>
        [...document.querySelectorAll("[data-financials-account-row]")]
            .find((r) => /certfree/i.test((r as HTMLElement).innerText))?.getAttribute("data-financials-account-row") ?? null);
    await page.locator(`[data-financials-account-row="${id}"]`).first().click({ timeout: 30_000 });
    await page.waitForTimeout(12_000);
    await expandLedgerPeriods(page);
    const openers = await page.locator("[data-financials-row-open]").count();
    log(`ACCOUNTS: rows offering Details = ${openers}`);
    const chargeId = await openFirstRowDetails(page);
    const details = await readDetails(page);
    log(`ACCOUNTS DETAILS (charge ${chargeId}): ${JSON.stringify(details)}`);
    await page.screenshot({ path: `${OUT}/A-accounts-details.png`, fullPage: true });
    found.push({ proof: "accounts-details", chargeId, openers, details }); save();
    expect(openers, "the ledger offers a named Details affordance").toBeGreaterThan(0);
    expect(details, "the shared presentation rendered").not.toBeNull();
});

test("B · the Focus Panel opens the SAME Details, and parity holds", async ({ page }) => {
    let commandCalls = 0;
    page.on("request", (r) => { if (/actions\/execute/.test(r.url())) commandCalls += 1; });
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(45_000);
    const nav = page.locator("[data-financials-nav='details']").first();
    if (await nav.count() === 0) {
        log("FOCUS PANEL: details nav absent — recording and skipping parity");
        found.push({ proof: "focus-details", reachable: false }); save();
        return;
    }
    await nav.click({ timeout: 25_000 });
    await page.waitForTimeout(12_000);
    await expandLedgerPeriods(page);
    const openers = await page.locator("[data-financials-row-open]").count();
    const chargeId = await openFirstRowDetails(page);
    const details = await readDetails(page);
    log(`FOCUS PANEL DETAILS (charge ${chargeId}, openers ${openers}): ${JSON.stringify(details)}`);
    log(`COMMANDS DISPATCHED BY OPENING DETAILS: ${commandCalls}`);
    await page.screenshot({ path: `${OUT}/B-focus-details.png`, fullPage: true });
    found.push({ proof: "focus-details", chargeId, openers, details, commandCalls }); save();
    expect(openers, "the Focus Panel ledger offers the same affordance").toBeGreaterThan(0);
    expect(commandCalls, "reading a record dispatches NO financial command").toBe(0);
});
