/**
 * What the Accounts list endpoint actually spends.
 *
 * The previous slice collapsed the subjects cohort from seven sequential waves to four and the
 * deployed number did not move, so the pole is somewhere reading the code did not find. The route
 * now publishes its boundaries; this reads them.
 */
import { expect, test } from "@playwright/test";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("the subjects route names its own cost", async ({ page }) => {
    const seen: Array<{ url: string; timing: string; ms: number; bytes: number }> = [];
    page.on("response", async (r) => {
        const u = r.url().replace(/https:\/\/[^/]+/, "").split("?")[0];
        if (!/financials\/(subjects|position|card)$/.test(u)) return;
        let bytes = 0;
        try { bytes = (await r.body()).byteLength; } catch { /* streamed */ }
        const t = r.request().timing();
        seen.push({ url: u, timing: r.headers()["server-timing"] ?? "(none published)", ms: Math.round(t.responseEnd - t.startTime), bytes });
    });

    /* One re-navigation, reported — a silent retry would hide a session that expired. */
    for (let attempt = 1; attempt <= 2; attempt++) {
        await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(13_000);
        const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
        if (await nav.count()) { await nav.click({ force: true, timeout: 20_000 }); break; }
        log(`workspace nav not ready on attempt ${attempt} (url=${page.url()})`);
        if (attempt === 2) throw new Error(`workspace nav never mounted at ${page.url()}`);
    }
    await page.waitForTimeout(11_000);
    seen.length = 0;
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 20_000 });
    await page.waitForFunction(() => document.querySelectorAll("[data-financials-ledger-row]").length > 0, undefined, { timeout: 120_000 }).catch(() => undefined);
    await page.waitForTimeout(4_000);

    for (const s of seen) {
        log(`\n${s.url}  ${s.ms}ms  ${s.bytes}B`);
        log(`  ${s.timing}`);
    }
    expect(seen.length).toBeGreaterThan(0);
});
