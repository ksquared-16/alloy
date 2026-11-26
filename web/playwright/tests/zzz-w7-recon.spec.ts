/** W7 recon: what the Focus Panel does, and which charge type can actually be charged. */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/w7-repair-1";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(1_800_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const found: Record<string, unknown>[] = [];
const record = () => { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/recon.json`, JSON.stringify(found, null, 2)); };

test("B · Discounts from the Focus Panel, given time to mount", async ({ page }) => {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    /* The card was a skeleton at 20s last pass. Wait on the card resolving, not on a fixed dwell. */
    const resolved = await page
        .waitForFunction(
            () => !!document.querySelector("[data-financials-nav='details']")
                || (!!document.querySelector("[data-financials-card]")
                    && !document.querySelector("[data-financials-card-skeleton]")),
            undefined,
            { timeout: 240_000 },
        )
        .then(() => true)
        .catch(() => false);
    const state = await page.evaluate(() => ({
        nav: !!document.querySelector("[data-financials-nav='details']"),
        skeleton: !!document.querySelector("[data-financials-card-skeleton]"),
        empty: document.querySelector("[data-financials-empty]")?.getAttribute("data-financials-empty") ?? null,
        subject: document.querySelector("[data-financials-subject]")?.getAttribute("data-financials-subject") ?? null,
        text: (document.querySelector("[data-financials-card]") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").slice(0, 200) ?? null,
    }));
    log(`FOCUS PANEL after wait (resolved=${resolved}): ${JSON.stringify(state)}`);
    await page.screenshot({ path: `${OUT}/focus-panel-state.png` });
    found.push({ proof: "focus-panel-state", resolved, ...state }); record();

    if (state.nav) {
        await page.locator("[data-financials-nav='details']").first().click({ timeout: 25_000 });
        await page.waitForTimeout(10_000);
        const gear = page.locator("[data-financials-manage-discounts='gear']").first();
        if (await gear.count()) {
            await gear.click({ timeout: 25_000 });
            await page.waitForTimeout(4_000);
            const d = await page.evaluate(() => ({
                present: !!document.querySelector("[data-financials-overlay='discount_admin']"),
                state: document.querySelector("[data-financials-discount-admin-state]")?.getAttribute("data-financials-discount-admin-state") ?? null,
                childRows: document.querySelectorAll("[data-financials-discount-child]").length,
                body: (document.querySelector("[data-financials-overlay='discount_admin']") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").slice(0, 220) ?? null,
            }));
            log(`FOCUS PANEL DISCOUNTS: ${JSON.stringify(d)}`);
            await page.screenshot({ path: `${OUT}/discounts-focus-panel.png` });
            found.push({ proof: "discounts-focus-panel", ...d }); record();
            expect(d.present && (d.state !== null || d.childRows > 0), "not silently blank in the Focus Panel either").toBe(true);
        } else {
            log("FOCUS PANEL: details opened but no Discounts gear");
            found.push({ proof: "discounts-focus-panel", reachable: false }); record();
        }
    }
});

test("A · which charge type can actually be charged, and what it inherits", async ({ page }) => {
    for (let a = 1; a <= 2; a++) {
        await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(13_000);
        const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
        if (await nav.count()) { await nav.click({ force: true, timeout: 20_000 }); break; }
    }
    await page.waitForTimeout(11_000);
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 30_000 });
    await page.waitForFunction(() => document.querySelectorAll("[data-financials-account-row]").length > 0, undefined, { timeout: 180_000 });
    await page.waitForTimeout(3_000);

    const target = await page.evaluate(() => {
        const rows = [...document.querySelectorAll("[data-financials-account-row]")];
        const pick = rows.find((r) => {
            const t = (r as HTMLElement).innerText;
            return /demo|automation|certfree|certopp/i.test(t) && !/certhouse|alvarez/i.test(t);
        });
        return pick ? { id: pick.getAttribute("data-financials-account-row"), label: (pick as HTMLElement).innerText.replace(/\s+/g, " ").slice(0, 70) } : null;
    });
    log(`ACCOUNT: ${JSON.stringify(target)}`);
    await page.locator(`[data-financials-account-row="${target!.id}"]`).first().click({ timeout: 30_000 });
    await page.waitForTimeout(7_000);

    /* The standing arrangement this account already has, read from its own panel. */
    const standing = await page.evaluate(() => {
        const g = document.querySelector("[data-financials-manage-responsibility='gear'], [data-financials-manage-responsibility='open']");
        const row = document.querySelector("[data-financials-arrangements]");
        return { gear: !!g, summary: (row as HTMLElement | null)?.innerText.replace(/\s+/g, " ").slice(0, 220) ?? null };
    });
    log(`STANDING ARRANGEMENT: ${JSON.stringify(standing)}`);

    await page.locator(".alloy-os-fdetail__actions button", { hasText: /^Add$/ }).first().click({ timeout: 25_000 });
    await expect(page.locator("[data-financials-overlay='add_charge']")).toHaveCount(1, { timeout: 60_000 });
    await page.waitForTimeout(4_000);

    /* Every configured type, and what each resolves to — the question the blank $0.00 raised. */
    const options = await page.evaluate(() => {
        const sel = document.querySelector("[data-testid='addcharge-template'], [data-alloy-select='addcharge-template']");
        const opts = sel ? [...sel.querySelectorAll("option, [role='option'], li")].map((o) => (o as HTMLElement).innerText.trim()) : [];
        return { found: !!sel, tag: sel?.tagName ?? null, opts: opts.slice(0, 12) };
    });
    log(`TEMPLATE CONTROL: ${JSON.stringify(options)}`);
    await page.screenshot({ path: `${OUT}/template-control.png`, fullPage: true });
    found.push({ proof: "templates", account: target, standing, options }); record();
    expect(found.length).toBeGreaterThan(0);
});
