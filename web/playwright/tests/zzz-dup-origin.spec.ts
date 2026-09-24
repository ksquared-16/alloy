/**
 * WHERE THE SECOND REQUEST COMES FROM — measured at the fetch boundary, not inferred.
 *
 * Two earlier repairs guessed at the effect graph and both were wrong. This wraps `fetch` before
 * any application code runs and records a stack for every `financials/card` call.
 */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/dup-origin";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("capture every financials/card fetch with its stack", async ({ page }) => {
    await page.addInitScript(() => {
        const w = window as unknown as {
            __CARD_FETCHES__?: Array<Record<string, unknown>>;
            fetch: typeof fetch;
        };
        w.__CARD_FETCHES__ = [];
        const original = w.fetch.bind(window);
        const inFlight = new Map<string, number>();
        w.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
            const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
            if (/financials\/card/.test(url)) {
                const key = url;
                const started = performance.now();
                const entry: Record<string, unknown> = {
                    at: Math.round(started),
                    url: url.replace(/https?:\/\/[^/]+/, ""),
                    route: location.pathname + location.search,
                    identicalInFlight: inFlight.get(key) ?? 0,
                    stack: (new Error("card-fetch").stack ?? "").split("\n").slice(1, 14).map((l) => l.trim()),
                };
                inFlight.set(key, (inFlight.get(key) ?? 0) + 1);
                w.__CARD_FETCHES__!.push(entry);
                return original(input as RequestInfo, init).then(
                    (res) => {
                        inFlight.set(key, Math.max(0, (inFlight.get(key) ?? 1) - 1));
                        entry.ms = Math.round(performance.now() - started);
                        entry.status = res.status;
                        return res;
                    },
                    (err) => { inFlight.set(key, Math.max(0, (inFlight.get(key) ?? 1) - 1)); throw err; },
                );
            }
            return original(input as RequestInfo, init);
        }) as typeof fetch;
    });

    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-financials-nav='details']").first()).toHaveCount(1, { timeout: 150_000 });
    expect(page.url(), "the governed QA session is live").not.toContain("/login");
    /* Clear whatever the panel did before the click; we want the DETAILS opening. */
    await page.evaluate(() => { (window as unknown as { __CARD_FETCHES__: unknown[] }).__CARD_FETCHES__.length = 0; });
    await page.locator("[data-financials-nav='details']").first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-detail='true']")).toHaveCount(1, { timeout: 150_000 });
    await page.waitForFunction(() => document.querySelectorAll("[data-financials-ledger-row]").length > 0, undefined, { timeout: 180_000 }).catch(() => undefined);
    await page.waitForTimeout(4000);

    const fetches = await page.evaluate(() => (window as unknown as { __CARD_FETCHES__: Array<Record<string, unknown>> }).__CARD_FETCHES__);
    log(`CARD FETCHES AFTER ONE DETAILS OPEN: ${fetches.length}`);
    fetches.forEach((f, i) => {
        log(`\n--- fetch #${i + 1} at ${f.at}ms (${f.ms}ms, identicalInFlight=${f.identicalInFlight}) ${f.url}`);
        (f.stack as string[]).forEach((l) => log(`      ${l}`));
    });
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/card-fetches.json`, JSON.stringify(fetches, null, 2));
});
