/**
 * §5 — Adjustment on the REAL operator path.
 *
 * Not a separate "Add adjustment" affordance: that was deliberately removed ("Add adjustment is
 * gone from here entirely: it is the Adjustment mode of the one financial entry command"). The
 * path is Add, then the "What to add" tablist. My earlier probe hunted the removed affordance and
 * reported the capability missing — the door had moved, not closed.
 *
 * Nothing is written.
 */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { alloyOptions, isAlloyControl } from "../helpers/alloyControls";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11c-slice2";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("Adjustment through the entry-mode tablist", async ({ page }) => {
    const R: Record<string, unknown> = {};
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url()).not.toContain("/login");

    await page.getByRole("button", { name: /^Add$/ }).first().click({ timeout: 20_000 });
    await page.waitForTimeout(9000);

    R.tablist = await page.evaluate(() => ({
        present: document.querySelectorAll("[role=tablist][aria-label='What to add']").length,
        tabs: Array.from(document.querySelectorAll("[data-financials-entry-mode-tab]")).map((t) => ({
            mode: t.getAttribute("data-financials-entry-mode-tab"),
            label: (t as HTMLElement).innerText.trim(),
            selected: t.getAttribute("aria-selected"),
        })),
    }));
    log(`TABLIST: ${JSON.stringify(R.tablist)}`);

    const adjustTab = page.locator('[data-financials-entry-mode-tab="adjustment"]').first();
    expect(await adjustTab.count(), "the Adjustment mode is offered").toBeGreaterThan(0);
    await adjustTab.click({ timeout: 20_000 });
    await page.waitForTimeout(11_000);

    const controls: Record<string, unknown> = {};
    for (const id of ["adjustment-agreement", "adjustment-source-charge", "adjustment-category"]) {
        const present = await page.locator(`[data-testid="${id}"]`).count();
        controls[id] = present
            ? { canonical: await isAlloyControl(page, id), options: (await alloyOptions(page, id)).map((o) => o.label).slice(0, 4) }
            : { present: 0 };
    }
    controls["adjustment-direction"] = { presentUnderCredit: await page.locator('[data-testid="adjustment-direction"]').count() };
    R.controls = controls;
    R.nativeSelects = await page.locator("select").count();
    R.panelOpen = await page.locator('[data-testid="adjustment-panel"]').count();
    log(`ADJUSTMENT CONTROLS: ${JSON.stringify(controls)}`);
    log(`panel=${R.panelOpen} nativeSelects=${R.nativeSelects}`);
    expect(R.nativeSelects, "no native select on the Adjustment surface").toBe(0);

    /* Switching to Adjustment and back must not strand the operator. */
    await page.locator('[data-financials-entry-mode-tab="charge"]').first().click({ timeout: 15_000 });
    await page.waitForTimeout(6000);
    R.backToCharge = {
        appliesTo: await page.locator('[data-testid="addcharge-target"]').count(),
        adjustmentPanel: await page.locator('[data-testid="adjustment-panel"]').count(),
    };
    log(`BACK TO CHARGE: ${JSON.stringify(R.backToCharge)}`);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/closure-adjustment-mounted.json`, JSON.stringify(R, null, 2));
});
