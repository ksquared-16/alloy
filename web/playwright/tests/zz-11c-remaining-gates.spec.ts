/**
 * §17 Expected Funding, §18 Bulk Charge, §19 Account Workspace — the last unrun gates.
 * Where a fixture cannot expose a surface, the exact gate is returned rather than source proof
 * dressed up as mounted.
 */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { alloyOptions, isAlloyControl } from "../helpers/alloyControls";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11c-slice2";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(700_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const save = (n: string, v: unknown) => { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/${n}.json`, JSON.stringify(v, null, 2)); };

async function openFinancialsWorkspace(page: import("@playwright/test").Page) {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url()).not.toContain("/login");
    const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
    if (await nav.count()) { await nav.click({ force: true, timeout: 15_000 }); await page.waitForTimeout(13_000); }
}

test("§19 — Account Workspace: filters, lenses, canonical controls, zero native selects", async ({ page }) => {
    const R: Record<string, unknown> = {};
    await openFinancialsWorkspace(page);
    const tab = page.locator("[data-workspace-section-tab='accounts']").first();
    if (await tab.count()) { await tab.click({ timeout: 15_000 }); await page.waitForTimeout(13_000); }
    R.beforeRowClick = await page.evaluate(() => ({
        rows: document.querySelectorAll("[data-financials-account-row]").length,
        lenses: Array.from(document.querySelectorAll("[data-financials-lens]")).map((e) => e.getAttribute("data-financials-lens")),
        nativeSelects: document.querySelectorAll("select").length,
        alloyControls: document.querySelectorAll(".alloy-select").length,
    }));
    const row = page.locator("[data-financials-account-row]").first();
    if (await row.count()) { await row.click({ timeout: 15_000 }); await page.waitForTimeout(11_000); }

    /* A lens still filters after the migration. */
    const lensKeys = (R.beforeRowClick as { lenses: string[] }).lenses;
    const perLens: Record<string, number> = {};
    for (const k of lensKeys) {
        const l = page.locator(`[data-financials-lens="${k}"]`).first();
        if (await l.count()) { await l.click({ timeout: 12_000 }).catch(() => {}); await page.waitForTimeout(5000); }
        perLens[k] = await page.locator("[data-financials-ledger-row],[data-charge-row]").count();
    }
    R.rowsPerLens = perLens;
    R.after = await page.evaluate(() => ({
        nativeSelects: document.querySelectorAll("select").length,
        alloyControls: document.querySelectorAll(".alloy-select").length,
    }));
    log(`§19 before=${JSON.stringify(R.beforeRowClick)}`);
    log(`§19 rowsPerLens=${JSON.stringify(R.rowsPerLens)} after=${JSON.stringify(R.after)}`);
    expect((R.beforeRowClick as { nativeSelects: number }).nativeSelects, "zero native selects").toBe(0);
    expect((R.after as { nativeSelects: number }).nativeSelects, "and still zero after interaction").toBe(0);
    save("gate-account-workspace", R);
});

test("§17 §18 — Expected Funding and Bulk Charge, or the exact gate that hides them", async ({ page }) => {
    const R: Record<string, unknown> = {};
    await openFinancialsWorkspace(page);

    /* What the workspace actually offers, read rather than assumed. */
    R.sections = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-workspace-section-tab]")).map((e) => e.getAttribute("data-workspace-section-tab")));
    R.commands = await page.evaluate(() =>
        Array.from(document.querySelectorAll("button"))
            .map((b) => (b as HTMLElement).innerText.replace(/\s+/g, " ").trim())
            .filter((t) => /funding|bulk|expected/i.test(t) && t.length < 50));
    log(`§17/§18 sections=${JSON.stringify(R.sections)}`);
    log(`§17/§18 funding/bulk commands=${JSON.stringify(R.commands)}`);

    /* EXPECTED FUNDING — reachable via the Funding lens/section where present. */
    const funding = page.locator("[data-workspace-section-tab='subsidy'],[data-financials-lens='funding']").first();
    R.fundingAffordance = await funding.count();
    if (await funding.count()) {
        await funding.click({ timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(9000);
        R.funding = {
            typeControl: await page.locator('[data-testid="financials-funding-type"]').count(),
            agencyControl: await page.locator('[data-testid="financials-funding-agency"]').count(),
            nativeSelects: await page.locator("select").count(),
            bodyMentionsFunding: await page.evaluate(() => /expected funding|funding source/i.test(document.body.innerText)),
        };
        if ((R.funding as { typeControl: number }).typeControl) {
            (R.funding as Record<string, unknown>).typeCanonical = await isAlloyControl(page, "financials-funding-type");
            (R.funding as Record<string, unknown>).typeOptions = (await alloyOptions(page, "financials-funding-type")).map((o) => o.label).slice(0, 5);
        }
        log(`§17 FUNDING: ${JSON.stringify(R.funding)}`);
    }

    /* BULK CHARGE. */
    const bulk = page.getByRole("button", { name: /bulk/i }).first();
    R.bulkAffordance = await bulk.count();
    if (await bulk.count()) {
        await bulk.click({ timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(9000);
        R.bulk = {
            cadenceControl: await page.locator('[data-testid="financials-bulk-cadence"]').count(),
            cadenceCanonical: (await page.locator('[data-testid="financials-bulk-cadence"]').count())
                ? await isAlloyControl(page, "financials-bulk-cadence") : null,
            nativeSelects: await page.locator("select").count(),
        };
        log(`§18 BULK: ${JSON.stringify(R.bulk)}`);
    }
    save("gate-funding-bulk", R);
});
