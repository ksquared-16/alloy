/** What creates the ~106px void before the ledger? Walk the ledger's ancestry. */
import { expect, test } from "@playwright/test";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("void anatomy", async ({ page }) => {
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

    const info = await page.evaluate(() => {
        const row = document.querySelector("[data-financials-ledger-row]") as HTMLElement | null;
        if (!row) return null;
        const chain: Array<Record<string, unknown>> = [];
        let e: HTMLElement | null = row;
        for (let i = 0; i < 8 && e; i++) {
            const cs = getComputedStyle(e);
            const r = e.getBoundingClientRect();
            chain.push({
                tag: e.tagName, cls: ((e.className || "") + "").slice(0, 46),
                top: Math.round(r.top), h: Math.round(r.height),
                mt: cs.marginTop, pt: cs.paddingTop, gap: cs.rowGap || cs.gap,
                display: cs.display, minH: cs.minHeight,
                firstChildTop: e.firstElementChild ? Math.round((e.firstElementChild as HTMLElement).getBoundingClientRect().top) : null,
            });
            e = e.parentElement;
        }
        const foot = document.querySelector(".alloy-os-process__foot") as HTMLElement | null;
        return { footBottom: foot ? Math.round(foot.getBoundingClientRect().bottom) : null, chain };
    });
    log(`VOID ANATOMY: ${JSON.stringify(info, null, 1)}`);
    expect(info).not.toBeNull();
});
