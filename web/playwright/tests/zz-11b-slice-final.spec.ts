/** Discounts forecast · unified Add target · prepaid three-surface parity. */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-setup";
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(560_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("forecast, target, prepaid", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const out: Record<string, unknown> = {};
    const t0 = Date.now();
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(15_000);
    expect(page.url()).not.toContain("/login");

    // ── PREPAID, surface 1: Focus Panel Summary (household panel). ──
    out.summary = await page.evaluate(() => {
        const card = document.querySelector("[data-universal-card-key='financials']") as HTMLElement | null;
        const el = card?.querySelector("[data-testid='available-prepaid'], [data-financials-line='available-prepaid']") as HTMLElement | null;
        const txt = card?.innerText ?? "";
        const m = /AVAILABLE\s*\n?\s*(\$[\d,]+\.\d{2})/i.exec(txt);
        return { present: Boolean(el) || Boolean(m), value: el?.innerText?.replace(/\n+/g, " ") ?? (m ? m[1] : null), cardText: txt.replace(/\n+/g, " · ").slice(0, 300) };
    });
    log(`PREPAID · Summary: ${JSON.stringify(out.summary)}`);

    // ── Assignment: discount forecast + performance. ──
    const tOpen = Date.now();
    await page.getByRole("button", { name: /^custom/ }).first().click({ force: true, timeout: 15_000 });
    await page.locator("[data-schedule-surface]").first().waitFor({ state: "visible", timeout: 30_000 });
    const shellMs = Date.now() - tOpen;
    await page.locator("[data-assignment-discount-forecast]").first().waitFor({ state: "attached", timeout: 30_000 }).catch(() => {});
    const forecastMs = Date.now() - tOpen;
    out.performance = { shellUsableMs: shellMs, forecastMs, shellNotBlocked: shellMs < forecastMs || shellMs < 2000 };
    out.forecast = await page.evaluate(() => {
        const el = document.querySelector("[data-assignment-discount-forecast]") as HTMLElement | null;
        return {
            present: Boolean(el),
            text: el?.innerText?.replace(/\n+/g, " · ") ?? null,
            outcomes: Array.from(document.querySelectorAll("[data-forecast-outcome]")).map((o) => ({
                kind: o.getAttribute("data-forecast-outcome"),
                reason: o.getAttribute("data-forecast-reason"),
                policy: o.getAttribute("data-forecast-policy"),
                text: (o as HTMLElement).innerText,
            })),
        };
    });
    log(`\nFORECAST: ${JSON.stringify(out.forecast, null, 1)}`);
    log(`PERFORMANCE: ${JSON.stringify(out.performance)}`);
    await page.screenshot({ path: `${OUT}/slice-forecast.png`, fullPage: true });

    // ── PREPAID, surfaces 2 and 3 + the unified Add target. ──
    await page.locator('[data-adminv2-sidebar-modal-nav="financials"]').first().click({ force: true });
    await page.waitForTimeout(9000);
    await page.locator('[data-workspace-section-tab="accounts"]').first().click({ force: true });
    await page.waitForTimeout(11_000);
    await page.locator("[data-financials-account-row]").first().click({ force: true });
    await page.waitForTimeout(12_000);
    out.accounts = await page.evaluate(() => {
        const t = document.body.innerText || "";
        const m = /AVAILABLE\s*\n?\s*(\$[\d,]+\.\d{2})/i.exec(t);
        return { value: m ? m[1] : null, saysDeposit: /\bDeposit\b/.test(t), zeroShown: /\$0\.00/.test(t) };
    });
    log(`\nPREPAID · Accounts: ${JSON.stringify(out.accounts)}`);

    /* Add Charge is hosted by the Focus Panel financials card, not the Accounts workspace. */
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(14_000);
    const add = page.locator("[data-universal-card-key='financials']").getByRole("button", { name: /^Add$/ }).first();
    log(`Add control on the card: ${await add.count()}`);
    if (await add.count()) { await add.click({ force: true }); await page.waitForTimeout(10_000); }
    out.target = await page.evaluate(() => {
        const t = document.querySelector("[data-addcharge-target]") as HTMLElement | null;
        const sum = document.querySelector("[data-addcharge-targetsum]") as HTMLElement | null;
        const submit = document.querySelector("[data-addcharge-submit]") as HTMLButtonElement | null;
        return {
            unified: Boolean(t),
            householdOffered: Boolean(document.querySelector("[data-addcharge-target-household]")),
            children: Array.from(document.querySelectorAll("[data-addcharge-child]")).map((c) => ({
                id: c.getAttribute("data-addcharge-child"), checked: (c as HTMLInputElement).checked,
            })),
            summary: sum?.innerText ?? null,
            legacySelectPresent: Boolean(document.querySelector("[data-addcharge-subject]")),
            legacyAlsoBill: document.body.innerText.includes("Also bill"),
            submitDisabled: submit?.disabled ?? null,
        };
    });
    log(`\nUNIFIED TARGET: ${JSON.stringify(out.target, null, 1)}`);
    await page.screenshot({ path: `${OUT}/slice-add-target.png`, fullPage: true });
    out.details = await page.evaluate(() => {
        const t = document.body.innerText || "";
        const m = /AVAILABLE PREPAID\s*\n?\s*(\$[\d,]+\.\d{2})/i.exec(t) ?? /AVAILABLE\s*\n?\s*(\$[\d,]+\.\d{2})/i.exec(t);
        return { value: m ? m[1] : null };
    });
    log(`\nPREPAID · Details(from card context): ${JSON.stringify(out.details)}`);
    writeFileSync(`${OUT}/slice-final.json`, JSON.stringify(out, null, 2));
});
