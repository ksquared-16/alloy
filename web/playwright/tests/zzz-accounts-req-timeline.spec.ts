/** Exact request START and END offsets from the Accounts click — is the chain serial? */
import { expect, test } from "@playwright/test";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("request timeline from the Accounts click", async ({ page }) => {
    await page.addInitScript(() => {
        const w = window as unknown as { __REQ__?: Array<Record<string, unknown>>; __T0__?: number; fetch: typeof fetch };
        w.__REQ__ = [];
        const orig = w.fetch.bind(window);
        w.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
            const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
            const short = url.replace(/https?:\/\/[^/]+/, "").split("?")[0];
            if (!/^\/api\//.test(short)) return orig(input as RequestInfo, init);
            const started = performance.now();
            const e: Record<string, unknown> = { url: short, start: Math.round(started) };
            w.__REQ__!.push(e);
            return orig(input as RequestInfo, init).then((r) => { e.end = Math.round(performance.now() - 0); e.ms = Math.round(performance.now() - started); return r; });
        }) as typeof fetch;
    });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.locator("[data-adminv2-sidebar-modal-nav='financials']").first().click({ force: true, timeout: 20_000 });
    await page.waitForTimeout(11_000);
    await page.evaluate(() => {
        const w = window as unknown as { __REQ__: unknown[]; __T0__: number };
        w.__REQ__.length = 0; w.__T0__ = performance.now();
    });
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 20_000 });
    await page.waitForFunction(() => document.querySelectorAll("[data-financials-ledger-row]").length > 0, undefined, { timeout: 120_000 }).catch(() => undefined);
    await page.waitForTimeout(3_000);
    const reqs = await page.evaluate(() => {
        const w = window as unknown as { __REQ__: Array<Record<string, number | string>>; __T0__: number };
        return w.__REQ__.map((r) => ({ url: r.url, startAt: Math.round((r.start as number) - w.__T0__), ms: r.ms }));
    });
    log("TIMELINE (offsets from the Accounts click):");
    for (const r of reqs) log(`  ${String(r.url).padEnd(46)} start=+${String(r.startAt).padStart(5)}ms  took=${String(r.ms).padStart(5)}ms  end=+${Number(r.startAt) + Number(r.ms)}ms`);
});
