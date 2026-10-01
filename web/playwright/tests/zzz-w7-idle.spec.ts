/**
 * IS THE STUCK CARD THE PRODUCT, OR THE PROBE?
 *
 * The card loads through `requestIdleCallback`. Playwright's `waitForFunction` polls on `raf` by
 * default, which keeps the page from ever being idle. Three runs that polled saw the card stuck at
 * `empty=loading` with zero card requests; the one run that slept instead saw it resolve. So the
 * probe is a suspect and is tested as one, A/B, in a single run.
 */
import { expect, test, type Page } from "@playwright/test";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

async function observe(page: Page, label: string, poll: "raf" | "sleep") {
    let cardCalls = 0;
    page.on("response", (r) => { if (/\/api\/admin\/financials\/card/.test(r.url())) cardCalls += 1; });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    /*
     * MOUNT FIRST. "No skeleton" is also true before the card exists at all, and reading that as
     * "resolved" is the absence-is-not-an-answer mistake this whole surface is written against.
     */
    const mounted = await page
        .waitForFunction(() => !!document.querySelector("[data-financials-card-skeleton]"), undefined, { timeout: 120_000 })
        .then(() => true)
        .catch(() => false);
    log(`${label}: card mounted into its pending state = ${mounted}`);
    if (!mounted) return { resolvedAt: null, cardCalls, skeleton: false, empty: "never-mounted" };
    const deadline = Date.now() + 180_000;
    let resolvedAt: number | null = null;
    const t0 = Date.now();
    while (Date.now() < deadline) {
        if (poll === "raf") {
            /* The suspect: a continuous rAF poll, which is what waitForFunction does by default. */
            await page
                .waitForFunction(() => !document.querySelector("[data-financials-card-skeleton]"), undefined, { timeout: 3_000 })
                .then(() => { resolvedAt = Date.now() - t0; })
                .catch(() => undefined);
        } else {
            await page.waitForTimeout(3_000);
            const done = await page.evaluate(() => !document.querySelector("[data-financials-card-skeleton]"));
            if (done) resolvedAt = Date.now() - t0;
        }
        if (resolvedAt != null) break;
    }
    const s = await page.evaluate(() => ({
        skeleton: !!document.querySelector("[data-financials-card-skeleton]"),
        empty: document.querySelector("[data-financials-empty]")?.getAttribute("data-financials-empty") ?? "absent",
    }));
    log(`${label} (poll=${poll}): resolvedAt=${resolvedAt ?? "NEVER"}ms cardCalls=${cardCalls} ${JSON.stringify(s)}`);
    return { resolvedAt, cardCalls, ...s };
}

test("A · polled with raf", async ({ page }) => { await observe(page, "RAF-POLLED", "raf"); });
test("B · sleeping between checks", async ({ page }) => {
    const r = await observe(page, "SLEEP-POLLED", "sleep");
    expect(r.cardCalls, "the card issues its read when the page is allowed to go idle").toBeGreaterThan(0);
});
