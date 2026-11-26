/** Section 18: the certified interaction contracts still approximately hold. */
import { expect, test, type Page, type Browser } from "@playwright/test";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(1_800_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

async function coldOpen(browser: Browser) {
    const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 900 }, baseURL: "https://staging.workwithalloy.com" });
    const page: Page = await ctx.newPage();
    try {
        for (let a = 1; a <= 2; a++) {
            await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
            await page.waitForTimeout(13_000);
            const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
            if (await nav.count()) { await nav.click({ force: true, timeout: 20_000 }); break; }
            if (a === 2) throw new Error("no workspace");
        }
        await page.waitForTimeout(11_000);
        const cardReqs: string[] = [];
        page.on("request", (r) => { const u = r.url(); if (u.indexOf("/api/admin/financials/card?") >= 0) cardReqs.push(u); });
        const click = Date.now();
        await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 30_000 });
        const interactive = await page.waitForFunction(() => {
            const rows = [...document.querySelectorAll("[data-financials-account-row]")];
            return rows.length > 0 && (rows[0] as HTMLElement).innerText.trim().length > 0 && !rows[0]!.hasAttribute("disabled");
        }, undefined, { timeout: 180_000 }).then(() => Date.now() - click).catch(() => null);
        await page.waitForTimeout(4_000);
        /* Per-account request counts, to confirm no duplicate for the default selection. */
        const byAccount = new Map<string, number>();
        for (const u of cardReqs) {
            const q = u.split("?")[1] ?? "";
            byAccount.set(q, (byAccount.get(q) ?? 0) + 1);
        }
        const dupes = [...byAccount.entries()].filter(([, n]) => n > 1);
        return { interactive, cardRequests: cardReqs.length, distinct: byAccount.size, dupes };
    } finally { await ctx.close(); }
}

test("list interactive and no duplicate card request", async ({ browser }) => {
    const runs: Array<Record<string, unknown>> = [];
    for (let i = 0; i < 3; i++) runs.push(await coldOpen(browser));
    for (const r of runs) log(`COLD LIST: interactive=${r.interactive}ms cardReqs=${r.cardRequests} distinctAccounts=${r.distinct} duplicates=${JSON.stringify(r.dupes)}`);
    const times = runs.map((r) => r.interactive as number).filter((n) => typeof n === "number").sort((a, b) => a - b);
    log(`COLD LIST P50: ${times[Math.floor((times.length - 1) / 2)]}ms (target <1000)`);
    for (const r of runs) expect((r.dupes as unknown[]).length, "no duplicate card request per account").toBe(0);
    expect(times.length).toBeGreaterThan(0);
});
