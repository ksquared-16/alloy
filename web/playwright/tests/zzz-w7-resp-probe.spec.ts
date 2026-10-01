/** Probe: what standing responsibility does the disposable account already have, and what can be set? */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/w7-repair-1/responsibility";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("what the disposable account's responsibility surface offers", async ({ page }) => {
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

    /* Every disposable candidate, so a fixture can be CHOSEN rather than assumed. */
    const candidates = await page.evaluate(() =>
        [...document.querySelectorAll("[data-financials-account-row]")]
            .map((r) => ({ id: r.getAttribute("data-financials-account-row"), label: (r as HTMLElement).innerText.replace(/\s+/g, " ").slice(0, 70) }))
            .filter((r) => /demo|automation|certfree|certopp/i.test(r.label) && !/certhouse|alvarez/i.test(r.label)));
    log(`DISPOSABLE CANDIDATES: ${JSON.stringify(candidates, null, 1)}`);

    const found: Record<string, unknown>[] = [];
    for (const c of candidates) {
        await page.locator(`[data-financials-account-row="${c.id}"]`).first().click({ timeout: 30_000 });
        await page.waitForTimeout(6_000);
        const gear = page.locator("[data-financials-manage-responsibility='gear'], [data-financials-manage-responsibility='open']").first();
        if (await gear.count() === 0) { found.push({ ...c, reachable: false }); continue; }
        await gear.click({ timeout: 25_000 });
        await page.waitForTimeout(5_000);
        const state = await page.evaluate(() => ({
            inForce: (document.querySelector("[data-financials-responsibility-arrangement='in-force']") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").slice(0, 200) ?? null,
            empty: !!document.querySelector("[data-financials-responsibility-empty]"),
            noParties: !!document.querySelector("[data-financials-responsibility-no-parties]"),
            shares: [...document.querySelectorAll("[data-financials-responsibility-share]")].map((e) => (e as HTMLElement).innerText.replace(/\s+/g, " ").trim()).slice(0, 6),
            members: [...document.querySelectorAll("[data-financials-arrangement-member]")].map((e) => (e as HTMLElement).innerText.replace(/\s+/g, " ").trim()).slice(0, 6),
            body: (document.querySelector("[data-financials-overlay='responsibility_admin'], [data-financials-entry='responsibility_admin']") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").slice(0, 320) ?? null,
        }));
        log(`${c.label} -> ${JSON.stringify(state)}`);
        found.push({ ...c, reachable: true, ...state });
        await page.screenshot({ path: `${OUT}/resp-${String(c.id).slice(0, 8)}.png` }).catch(() => undefined);
        /* Back to the list without Escape — Escape belongs to the command layer here. */
        const close = page.locator("[data-financials-responsibility-done], [data-financials-responsibility-cancel]").first();
        if (await close.count()) await close.click({ timeout: 15_000 }).catch(() => undefined);
        await page.waitForTimeout(3_000);
    }
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/probe.json`, JSON.stringify(found, null, 2));
    expect(found.length).toBeGreaterThan(0);
});
