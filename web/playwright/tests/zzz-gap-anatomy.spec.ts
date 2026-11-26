/** What occupies the space between the lens bar and the ledger head? */
import { expect, test } from "@playwright/test";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("gap anatomy", async ({ page }) => {
    for (let a = 1; a <= 2; a++) {
        await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(13_000);
        const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
        if (await nav.count()) { await nav.click({ force: true, timeout: 20_000 }); break; }
        if (a === 2) throw new Error("no workspace");
    }
    await page.waitForTimeout(11_000);
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 30_000 });
    await page.waitForFunction(() => document.querySelectorAll("[data-financials-ledger-row]").length > 0, undefined, { timeout: 180_000 }).catch(() => undefined);
    await page.waitForTimeout(3_000);

    const anatomy = await page.evaluate(() => {
        const lenses = document.querySelector("[data-financials-lenses]");
        const row = document.querySelector("[data-financials-ledger-row]");
        if (!lenses || !row) return null;
        const lb = lenses.getBoundingClientRect().bottom;
        const rt = row.getBoundingClientRect().top;
        const between: Array<Record<string, unknown>> = [];
        document.querySelectorAll("*").forEach((e) => {
            const r = e.getBoundingClientRect();
            if (r.height <= 0 || r.width <= 0) return;
            if (r.top >= lb - 1 && r.bottom <= rt + 1) {
                const cs = getComputedStyle(e);
                between.push({
                    tag: e.tagName,
                    cls: ((e.className || "") + "").slice(0, 52),
                    top: Math.round(r.top), h: Math.round(r.height),
                    mt: cs.marginTop, mb: cs.marginBottom, pt: cs.paddingTop, pb: cs.paddingBottom,
                    text: ((e as HTMLElement).innerText || "").replace(/\s+/g, " ").slice(0, 34),
                });
            }
        });
        between.sort((a, b) => (a.top as number) - (b.top as number));
        return { lensesBottom: Math.round(lb), firstRowTop: Math.round(rt), gap: Math.round(rt - lb), between: between.slice(0, 14) };
    });
    log(`GAP ANATOMY: ${JSON.stringify(anatomy, null, 1)}`);
    expect(anatomy).not.toBeNull();
});
