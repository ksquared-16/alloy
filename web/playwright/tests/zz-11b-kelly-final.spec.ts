import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("assignment card in full, and the responsibility gear by clicking", async ({ page }) => {
    const R: Record<string, unknown> = {};
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(17_000);
    expect(page.url()).not.toContain("/login");
    await page.getByRole("button", { name: /^custom/ }).first().click({ timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(14_000);

    R.assignment = await page.evaluate(() => {
        const s = document.querySelector("[data-universal-card-key='scheduling']") as HTMLElement | null;
        const t = s ? s.innerText.replace(/\s+/g, " ") : "";
        return {
            fullText: t,
            hasBillingFrequencyLine: /billing frequency/i.test(t),
            billingFrequencyText: (/Billing frequency[^·]*·[^·]*·[^A-Z]*/i.exec(t) || [null])[0],
            acceptedTermShown: /accepted|overridden/i.test(t),
            discountBlock: (/DISCOUNTS[\s\S]{0,220}/i.exec(t) || [null])[0],
        };
    });
    log(`ASSIGNMENT hasBillingFrequency=${(R.assignment as Record<string,unknown>).hasBillingFrequencyLine}`);
    log(`  freq: ${(R.assignment as Record<string,unknown>).billingFrequencyText}`);
    log(`  discounts: ${(R.assignment as Record<string,unknown>).discountBlock}`);
    log(`  acceptedShown: ${(R.assignment as Record<string,unknown>).acceptedTermShown}`);

    /* ── THE RESPONSIBILITY GEAR — reached by clicking only ──────────────────────────────── */
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(1500);
    const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
    const step: Record<string, unknown> = { sidebarPresent: (await nav.count()) > 0 };
    if (step.sidebarPresent) {
        step.accessibleName = (await nav.getAttribute("aria-label")) ?? (await nav.textContent());
        /* An overlay intercepts a plain click here — recorded, because that is itself friction. */
        step.plainClickWorked = await nav.click({ timeout: 6_000 }).then(() => true).catch(() => false);
        if (!step.plainClickWorked) await nav.click({ force: true, timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(13_000);
        const tab = page.locator("[data-workspace-section-tab='accounts']").first();
        step.accountsTabVisible = (await tab.count()) > 0;
        if (step.accountsTabVisible) { await tab.click({ timeout: 15_000 }).catch(() => {}); await page.waitForTimeout(13_000); }
        step.afterAccounts = await page.evaluate(() => ({
            accountRows: document.querySelectorAll("[data-financials-account-row]").length,
            gearPresent: Boolean(document.querySelector("[data-financials-manage-responsibility]")),
            responsibleWordVisible: /responsib/i.test(document.body.innerText || ""),
        }));
        /* Open an account row, which is where the gear lives. */
        const row = page.locator("[data-financials-account-row]").first();
        if (await row.count()) {
            await row.click({ timeout: 15_000 }).catch(() => {});
            await page.waitForTimeout(13_000);
            step.afterOpeningAccount = await page.evaluate(() => ({
                gearPresent: Boolean(document.querySelector("[data-financials-manage-responsibility]")),
                responsibleWordVisible: /responsib/i.test(document.body.innerText || ""),
                prepaidWordVisible: /prepaid/i.test(document.body.innerText || ""),
                availableVisible: /available/i.test(document.body.innerText || ""),
            }));
        }
    }
    R.responsibilityPath = step;
    log(`RESPONSIBILITY PATH: ${JSON.stringify(step)}`);
    await page.screenshot({ path: "../certification/financials/11b-audit/05-accounts.png", fullPage: true });
    writeFileSync("../certification/financials/11b-audit/kelly-final.json", JSON.stringify(R, null, 2));
});
