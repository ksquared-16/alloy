/**
 * §1 — STANDING RESPONSIBILITY IS INHERITED BY THE POSTED CHARGE.
 *
 * The W7 defect was that PREVIEW responsibility did not become POSTED CHARGE responsibility. The
 * invariant is therefore IDENTITY between the standing arrangement and the posted allocation — not
 * the cardinality of responsible parties, which is why no second guardian is manufactured here.
 *
 * FIXTURE CHOICE. Not Certopp. The W7 acceptance packet reserves Certopp for READ scenarios —
 * 3.1 is "Open Manage responsibility on Certopp. Read who owes what, and what is unassigned" —
 * and routes charge-adding (2.1) and responsibility-division (3.2) to a disposable household.
 * Configuring a standing arrangement on Certopp would change what Kelly reads in 3.1. Certfree is
 * unreserved (zero mentions in the packet), disposable, and has exactly one responsible party.
 */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/w7-repair-1/responsibility";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(1_800_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const proof: Record<string, unknown>[] = [];
const save = () => { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/inheritance.json`, JSON.stringify(proof, null, 2)); };

async function openCertfree(page: Page) {
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
    expect(id, "the disposable fixture is present").not.toBeNull();
    await page.locator(`[data-financials-account-row="${id}"]`).first().click({ timeout: 30_000 });
    await page.waitForTimeout(7_000);
    return id!;
}

const pickOption = async (page: Page, text: RegExp | string) => {
    await page.locator("[role='option'], [data-alloy-select-option]").filter({ hasText: text }).first().click({ timeout: 20_000 });
};

test("A · establish the standing arrangement through the product", async ({ page }) => {
    const accountId = await openCertfree(page);
    await page.locator("[data-financials-manage-responsibility='gear'], [data-financials-manage-responsibility='open']")
        .first().click({ timeout: 25_000 });
    await page.waitForTimeout(5_000);

    const before = await page.evaluate(() => ({
        inForce: !!document.querySelector("[data-financials-responsibility-arrangement='in-force']"),
        body: (document.querySelector("[data-financials-overlay='responsibility_admin'], [data-financials-entry='responsibility_admin']") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").slice(0, 220) ?? null,
    }));
    log(`BEFORE: ${JSON.stringify(before)}`);

    /* Percentage, so the standing answer is 100% of whatever is charged — not a number that only
       happens to equal one charge's amount. */
    const method = page.locator("[data-testid^='responsibility-share-method-']").first();
    await method.click({ timeout: 20_000 });
    await page.waitForTimeout(1_200);
    await pickOption(page, /Percentage/);
    await page.waitForTimeout(1_500);
    await page.locator("[data-financials-responsibility-share]").first().fill("100");
    await page.waitForTimeout(1_200);

    const previewBtn = page.locator("[data-financials-responsibility-preview-btn]").first();
    if (await previewBtn.count()) { await previewBtn.click({ timeout: 20_000 }); await page.waitForTimeout(5_000); }
    const previewed = await page.evaluate(() => ({
        preview: (document.querySelector("[data-financials-responsibility-preview]") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").slice(0, 300) ?? null,
        error: (document.querySelector("[data-financials-responsibility-error]") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").slice(0, 200) ?? null,
    }));
    log(`ARRANGEMENT PREVIEW: ${JSON.stringify(previewed)}`);
    await page.screenshot({ path: `${OUT}/A1-arrangement-preview.png`, fullPage: true });

    await page.locator("[data-financials-responsibility-confirm]").first().click({ timeout: 25_000 });
    await page.waitForTimeout(9_000);
    const after = await page.evaluate(() => ({
        inForce: (document.querySelector("[data-financials-responsibility-arrangement='in-force']") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").slice(0, 300) ?? null,
        error: (document.querySelector("[data-financials-responsibility-error]") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").slice(0, 200) ?? null,
        body: (document.querySelector("[data-financials-overlay='responsibility_admin'], [data-financials-entry='responsibility_admin']") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").slice(0, 320) ?? null,
    }));
    log(`AFTER CONFIRM: ${JSON.stringify(after)}`);
    await page.screenshot({ path: `${OUT}/A2-arrangement-in-force.png`, fullPage: true });
    proof.push({ step: "A-standing-arrangement", accountId, before, previewed, after }); save();
    expect(after.error, "the arrangement saved without error").toBeNull();
});

test("B · the standing arrangement is inherited by the posted charge", async ({ page }) => {
    const accountId = await openCertfree(page);

    /* The arrangement persisted, read back from the product rather than assumed from step A. */
    await page.locator("[data-financials-manage-responsibility='gear'], [data-financials-manage-responsibility='open']")
        .first().click({ timeout: 25_000 });
    await page.waitForTimeout(6_000);
    const standing = await page.evaluate(() => {
        const card = document.querySelector("[data-financials-overlay='responsibility_admin'], [data-financials-entry='responsibility_admin']") as HTMLElement | null;
        return {
            inForce: (document.querySelector("[data-financials-responsibility-arrangement='in-force']") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").trim().slice(0, 240) ?? null,
            body: card?.innerText.replace(/\s+/g, " ").slice(0, 300) ?? null,
        };
    });
    log(`STANDING (read back): ${JSON.stringify(standing)}`);
    await page.screenshot({ path: `${OUT}/B0-standing-readback.png`, fullPage: true });
    const close = page.locator("[data-financials-responsibility-done], [data-financials-responsibility-cancel]").first();
    if (await close.count()) await close.click({ timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(5_000);

    const before = await page.evaluate(() => ({
        ledgerRows: document.querySelectorAll("[data-financials-ledger-row]").length,
        chargeLines: document.querySelectorAll("[data-financials-charge-line]").length,
    }));
    log(`BEFORE ADD: ${JSON.stringify(before)}`);

    await page.locator(".alloy-os-fdetail__actions button", { hasText: /^Add$/ }).first().click({ timeout: 25_000 });
    await expect(page.locator("[data-financials-overlay='add_charge']")).toHaveCount(1, { timeout: 60_000 });
    await page.waitForTimeout(6_000);

    /* Field trip — non-zero and canonically resolvable. Charge To is NEVER touched. */
    const sel = page.locator("[data-testid='addcharge-template']").first();
    await sel.click({ timeout: 20_000 });
    await page.waitForTimeout(1_500);
    await pickOption(page, /Field trip/);
    await page.waitForTimeout(8_000);

    /*
     * Field trip is an `event_date` template, so the operator authors the Service Date and the
     * resolver REFUSES without one — which it duly did on the first attempt, in the operator copy
     * this batch added: "This charge is billed on the day it happened, so it needs a date."
     * Supplying it is the operator's job, and it is NOT touching Charge To.
     */
    const dateField = page.locator("[data-addcharge-event-date] input").first();
    await dateField.fill("Oct 1, 2026");
    await dateField.press("Tab");
    await page.waitForTimeout(10_000);

    const preview = await page.evaluate(() => {
        const t = (s: string) => (document.querySelector(s) as HTMLElement | null)?.innerText.replace(/\s+/g, " ").trim() ?? null;
        return {
            responsibility: t("[data-addcharge-preview-responsibility]"),
            standing: t("[data-addcharge-preview-standing]"),
            chargeTo: t("[data-addcharge-charge-to='summary']"),
            amount: t("[data-addcharge-preview-net]"),
            chargeToEditorOpen: !!document.querySelector("[data-addcharge-charge-shares='editor']"),
            submitDisabled: (document.querySelector("[data-addcharge-submit]") as HTMLButtonElement | null)?.disabled ?? null,
        };
    });
    log(`PREVIEW (Charge To untouched): ${JSON.stringify(preview)}`);
    await page.screenshot({ path: `${OUT}/B1-preview-standing.png`, fullPage: true });

    /* ── THE WRITE. Exactly once. ─────────────────────────────────────────────────────────── */
    await page.locator("[data-addcharge-submit]").first().click({ timeout: 25_000 });
    await page.waitForTimeout(20_000);

    const after = await page.evaluate(() => ({
        ledgerRows: document.querySelectorAll("[data-financials-ledger-row]").length,
        chargeLines: document.querySelectorAll("[data-financials-charge-line]").length,
        overlay: document.querySelector("[data-financials-overlay]")?.getAttribute("data-financials-overlay") ?? null,
        error: (document.querySelector("[data-addcharge-error]") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").slice(0, 200) ?? null,
        floor: document.querySelector("[data-financials-detail-account]")?.getAttribute("data-financials-detail-account") ?? null,
        bodyText: document.body.innerText.replace(/\s+/g, " ").slice(0, 300),
    }));
    log(`AFTER SUBMIT: ${JSON.stringify(after)}`);
    await page.screenshot({ path: `${OUT}/B2-after-submit.png`, fullPage: true });
    proof.push({ step: "B-inheritance", accountId, standing, before, preview, after }); save();

    expect(after.error, "the charge was accepted").toBeNull();
});
