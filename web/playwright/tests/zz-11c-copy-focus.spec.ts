/**
 * §14/§20 re-measured WITHOUT spending an extra Escape.
 *
 * The previous pass read the scope options with `alloyOptions`, which opens the listbox and closes
 * it again with Escape. That Escape is a real dismissal of a real layer, so the explicit Escape
 * that followed was the SECOND one and closed the parent — correct one-layer-at-a-time behaviour
 * misread as a focus defect. Here the panel copy is read directly and the listbox is never opened.
 */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { activeElementDescriptor } from "../helpers/alloyControls";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11c-slice2";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

const readPanel = (page: import("@playwright/test").Page) => page.evaluate(() => {
    const p = document.querySelector('[data-financials-manage-responsibility="open-panel"]') as HTMLElement | null;
    const trigger = p?.querySelector('[data-testid="responsibility-scope"] .alloy-select__value') as HTMLElement | null;
    return {
        open: Boolean(p),
        scopeTrigger: trigger?.innerText?.replace(/\s+/g, " ").trim() ?? null,
        copy: p?.innerText?.replace(/\s+/g, " ").slice(0, 900) ?? null,
    };
});

test("Details — panel copy and focus restoration, one Escape", async ({ page }) => {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url()).not.toContain("/login");
    await page.locator("[data-financials-card='true']").getByRole("button", { name: /^Details/ }).first().click({ timeout: 20_000 });
    await page.waitForTimeout(12_000);
    const gear = page.locator('[data-financials-manage-responsibility="gear"]').first();
    await gear.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(9000);
    const panel = await readPanel(page);
    const rowsWhileOpen = await page.locator("[data-financials-ledger-row],[data-charge-row]").count();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(3500);
    const after = {
        panel: (await readPanel(page)).open,
        rows: await page.locator("[data-financials-ledger-row],[data-charge-row]").count(),
        detailsOpen: await page.locator("[data-financials-payment-methods]").count(),
        focus: await activeElementDescriptor(page),
    };
    log(`DETAILS PANEL: ${JSON.stringify(panel)}`);
    log(`DETAILS AFTER ONE ESCAPE: ${JSON.stringify({ ...after, rowsWhileOpen })}`);
    expect(after.panel, "panel closed").toBe(false);
    expect(after.detailsOpen, "Details survives").toBeGreaterThan(0);
    expect(after.focus, "focus returns to the gear").toContain("Manage responsibility");
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/final-details-panel.json`, JSON.stringify({ panel, after, rowsWhileOpen }, null, 2));
});

test("Accounts — same contract, one Escape", async ({ page }) => {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
    if (await nav.count()) { await nav.click({ force: true, timeout: 15_000 }); await page.waitForTimeout(13_000); }
    const tab = page.locator("[data-workspace-section-tab='accounts']").first();
    if (await tab.count()) { await tab.click({ timeout: 15_000 }); await page.waitForTimeout(13_000); }
    const row = page.locator("[data-financials-account-row]").first();
    if (await row.count()) { await row.click({ timeout: 15_000 }); await page.waitForTimeout(11_000); }
    const gear = page.locator('[data-financials-manage-responsibility="gear"]').first();
    await gear.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(9000);
    const panel = await readPanel(page);
    const rowsWhileOpen = await page.locator("[data-financials-account-row]").count();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(3500);
    const after = {
        panel: (await readPanel(page)).open,
        rows: await page.locator("[data-financials-account-row]").count(),
        focus: await activeElementDescriptor(page),
    };
    log(`ACCOUNTS PANEL: ${JSON.stringify(panel)}`);
    log(`ACCOUNTS AFTER ONE ESCAPE: ${JSON.stringify({ ...after, rowsWhileOpen })}`);
    expect(after.panel, "panel closed").toBe(false);
    expect(after.rows, "the accounts list survives").toBe(rowsWhileOpen);
    expect(after.focus, "focus returns to the gear").toContain("Manage responsibility");
    writeFileSync(`${OUT}/final-accounts-panel.json`, JSON.stringify({ panel, after, rowsWhileOpen }, null, 2));
});
