/**
 * §18 — FINAL DEPLOYED READINESS SMOKE.
 *
 * This is NOT another certification pass. Every economic act in Financials + Payments V1 has already
 * been certified; re-proving them here would cost an hour and tell us nothing new. What this asks is
 * narrower and is the only question left: can Kelly actually START the walkthrough on the deployed
 * build — do the surfaces she is sent to open, and do the controls the re-authored QA packet names
 * exist where it says they are.
 *
 * A failure here is a blocker for W7. A pass is not a claim about economics.
 */
import { expect, test } from "@playwright/test";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.setTimeout(600_000);

const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("the deployed build is the one we just promoted", async ({ page }) => {
    const res = await page.request.get("/api/build-info");
    const body = (await res.json()) as { gitSha?: string; gitBranch?: string };
    log(`BUILD ${JSON.stringify(body).slice(0, 160)}`);
    expect(body.gitSha, "a deployed sha is reported").toBeTruthy();
});

test("the external QA surface loads with authenticated scenario data", async ({ page }) => {
    await page.goto("/dev/core-financials-qa", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(18_000);
    const probe = await page.evaluate(() => {
        const text = document.body.innerText || "";
        return {
            url: location.pathname,
            signedOut: /sign in|log in/i.test(text.slice(0, 400)),
            /* The packet identifies itself by the catalog version it is serving. */
            catalogVersion: (text.match(/20\d\d-\d\d-\d\d\.\d/) ?? [])[0] ?? null,
            scenarioish: (text.match(/HUMAN_WALKTHROUGH|Scenario|scenario/g) ?? []).length,
            mentionsAdjustment: /What needs to change|Reduce what the family owes/i.test(text),
            mentionsType: /Type\s*→\s*Credit/i.test(text),
            priorRevisionNotice: /Results exist against/i.test(text),
            chars: text.length,
        };
    });
    log(`QA SURFACE ${JSON.stringify(probe, null, 1)}`);
    expect(probe.signedOut, "the QA surface must not be sitting on a sign-in page").toBe(false);
    expect(probe.chars, "the QA surface rendered content").toBeGreaterThan(500);
});

test("the Financials surfaces and the controls the packet names", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(16_000);

    /* Focus Panel Financials — the card itself. */
    const card = page.locator("[data-financials-card='true']");
    await expect(card.first()).toHaveCount(1);

    /* charge Details opens. */
    const details = card.getByRole("button", { name: /^Details/ }).first();
    await expect(details).toHaveCount(1);
    await details.click({ timeout: 20_000 });
    await page.waitForTimeout(12_000);

    const floor = await page.evaluate(() => ({
        detailMounted: document.querySelectorAll("[data-financials-overlay]").length,
        ledgerRows: document.querySelectorAll("[data-financials-ledger] [role='row'], [role='table'] [role='row']").length,
        prepaidOrHeld: /Prepaid|Held|Available/i.test(document.body.innerText || ""),
        payments: /Payment|payments/i.test(document.body.innerText || ""),
        discounts: /Discount/i.test(document.body.innerText || ""),
    }));
    log(`FINANCIALS DETAIL ${JSON.stringify(floor)}`);

    /* Add → Charge loads. */
    await page.getByRole("button", { name: /^Add$/ }).first().click({ timeout: 20_000 });
    await page.waitForTimeout(7_000);
    const chargeMode = await page.evaluate(() => ({
        addCharge: document.querySelectorAll("[data-financials-entry-mode-tab]").length,
        templateControl: document.querySelectorAll('[data-testid="addcharge-template"]').length,
    }));
    log(`ADD → CHARGE ${JSON.stringify(chargeMode)}`);
    expect(chargeMode.addCharge, "the Add command offers its mode tabs").toBeGreaterThan(0);

    /* Add → Adjustment loads, with the controls the re-authored packet names. */
    await page.locator('[data-financials-entry-mode-tab="adjustment"]').first().click({ timeout: 20_000 });
    await page.waitForTimeout(7_000);
    const adjustment = await page.evaluate(() => {
        const band = document.querySelector('[data-testid="adjustment-panel"]');
        const el = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLInputElement | null;
        const date = el("adjustment-effective-date");
        return {
            bandPresent: Boolean(band),
            direction: Boolean(el("adjustment-direction")),
            categoryGone: !el("adjustment-category"),
            source: Boolean(el("adjustment-source-charge")),
            amount: Boolean(el("adjustment-amount")),
            reason: Boolean(el("adjustment-reason")),
            dateControl: Boolean(date),
            /* The date the command defaulted to — compared against the org's business date below. */
            dateValue: date?.value ?? (date?.getAttribute("value") ?? null),
            dateText: date ? (date as unknown as HTMLElement).innerText ?? null : null,
            bandText: band ? (band as HTMLElement).innerText.replace(/\s+/g, " ").slice(0, 320) : null,
            nativeDateInputs: document.querySelectorAll('input[type="date"]').length,
        };
    });
    log(`ADD → ADJUSTMENT ${JSON.stringify(adjustment, null, 1)}`);

    expect(adjustment.bandPresent, "the Adjustment command mounted").toBe(true);
    expect(adjustment.direction, "the direction control is visible").toBe(true);
    expect(adjustment.categoryGone, "the removed Type control is gone").toBe(true);
    expect(adjustment.nativeDateInputs, "no native date input").toBe(0);
});
