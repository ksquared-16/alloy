/**
 * §4 — reproduce the Accounts failure on the repaired build and MEASURE which owner acts first.
 *
 * Probe listeners are installed at every phase/target so the ordering is observed rather than
 * reasoned about: the previous run reasoned about it, shipped a bubble guard, and the guard was
 * outranked by a capture listener it never saw.
 */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11c-slice2";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("Accounts: who owns Escape", async ({ page }) => {
    const R: Record<string, unknown> = {};
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url(), "QA session is live").not.toContain("/login");

    const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
    if (await nav.count()) { await nav.click({ force: true, timeout: 15_000 }); await page.waitForTimeout(13_000); }
    const tab = page.locator("[data-workspace-section-tab='accounts']").first();
    if (await tab.count()) { await tab.click({ timeout: 15_000 }); await page.waitForTimeout(13_000); }
    const row = page.locator("[data-financials-account-row]").first();
    if (await row.count()) { await row.click({ timeout: 15_000 }); await page.waitForTimeout(11_000); }

    const gear = page.locator('[data-financials-manage-responsibility="gear"]').first();
    expect(await gear.count(), "Accounts has the gear").toBeGreaterThan(0);
    await gear.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(9000);

    /* Observe the key's journey and what each stage sees. */
    await page.evaluate(() => {
        (window as unknown as { __esc: string[] }).__esc = [];
        const rec = (label: string) => (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            const w = window as unknown as { __esc: string[] };
            const a = document.activeElement as HTMLElement | null;
            w.__esc.push(`${label} propagationStopped=${e.cancelBubble} panel=${document.querySelectorAll('[data-financials-manage-responsibility="open-panel"]').length} focus=${a?.tagName ?? "?"}[${a?.getAttribute("data-financials-manage-responsibility") ?? a?.getAttribute("aria-label") ?? ""}]`);
        };
        window.addEventListener("keydown", rec("1.window-CAPTURE"), true);
        document.addEventListener("keydown", rec("2.document-CAPTURE"), true);
        document.addEventListener("keydown", rec("3.document-BUBBLE"), false);
        window.addEventListener("keydown", rec("4.window-BUBBLE"), false);
    });

    R.before = await page.evaluate(() => ({
        panel: document.querySelectorAll('[data-financials-manage-responsibility="open-panel"]').length,
        accountRows: document.querySelectorAll("[data-financials-account-row]").length,
        gear: document.querySelectorAll('[data-financials-manage-responsibility="gear"]').length,
        modalShell: document.querySelectorAll("[data-adminv2-bos-modal]").length,
    }));

    await page.keyboard.press("Escape");
    await page.waitForTimeout(3500);

    R.journey = await page.evaluate(() => (window as unknown as { __esc: string[] }).__esc);
    R.after = await page.evaluate(() => ({
        panel: document.querySelectorAll('[data-financials-manage-responsibility="open-panel"]').length,
        accountRows: document.querySelectorAll("[data-financials-account-row]").length,
        gear: document.querySelectorAll('[data-financials-manage-responsibility="gear"]').length,
        modalShell: document.querySelectorAll("[data-adminv2-bos-modal]").length,
        focus: (() => { const a = document.activeElement as HTMLElement | null;
            return a === document.body ? "BODY" : `${a?.tagName}[${a?.getAttribute("aria-label") ?? ""}]`; })(),
    }));

    log(`§4 BEFORE: ${JSON.stringify(R.before)}`);
    log(`§4 AFTER:  ${JSON.stringify(R.after)}`);
    log(`§4 JOURNEY:\n  ${(R.journey as string[]).join("\n  ")}`);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/accounts-escape-order.json`, JSON.stringify(R, null, 2));
});
