/**
 * FINAL POLISH — WHERE THE DETAILS WAIT ACTUALLY GOES.
 *
 * "Several seconds" is not a diagnosis, and the wrong repair for a slow read is a cache. The route
 * publishes Server-Timing marks; this reads them, and separately times the whole click-to-complete
 * path in the browser, so client, network, server phases and render are each named.
 *
 * Every request is issued from INSIDE the page context. Driving the API with the slot cookies from
 * curl rotates the single-use refresh token and kills the browser session — measured, twice.
 */
import { test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const BASE = "http://127.0.0.1:3012";
const LANE = "/workspace/work-unit/enrolled-children";
const SUBJECT = "b5b62172-8b27-44ff-a852-b11b8888a6cd";
const HOUSEHOLD = "29944d3e-8267-45b7-8dcb-7405060e2573";
const OUT = "../certification/financials";
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test.use({ storageState: STORAGE, baseURL: BASE, viewport: { width: 1680, height: 1050 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(600_000);

test("server phase decomposition", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto(`${LANE}?subject_id=${SUBJECT}`);
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-financials-card="true"]').first().waitFor({ state: "visible", timeout: 180_000 });
    await page.waitForTimeout(6_000);
    for (const pass of [1, 2, 3]) {
        log(`SERVER_TIMING_${pass} ` + JSON.stringify(await page.evaluate(async (household) => {
            const t0 = performance.now();
            const res = await fetch(`/api/admin/financials/card?customer_id=${household}`, { credentials: "include" });
            const ttfb = performance.now() - t0;
            const text = await res.text();
            const total = performance.now() - t0;
            return {
                status: res.status,
                serverTiming: res.headers.get("server-timing"),
                bytes: text.length,
                ttfbMs: Math.round(ttfb),
                totalMs: Math.round(total),
                parseMs: (() => { const s = performance.now(); JSON.parse(text); return Math.round(performance.now() - s); })(),
            };
        }, HOUSEHOLD)));
    }
});

/** The whole journey, as the operator experiences it: click to the committed Details surface. */
async function clickToComplete(page: Page, label: string) {
    await page.evaluate(() => {
        const w = window as unknown as { __t?: Record<string, number>; __film?: string[] };
        w.__t = {}; w.__film = [];
        const t0 = performance.now();
        let last = "";
        const tick = () => {
            const host = document.querySelector("[data-financials-overlay]");
            const sig = [
                `surface=${host?.getAttribute("data-financials-overlay") ?? "compact"}`,
                `pending=${document.querySelector("[data-financials-details-pending]") ? "true" : "false"}`,
                `rows=${document.querySelectorAll("[data-financials-ledger-row]").length}`,
                `periods=${document.querySelectorAll("[data-financials-ledger-period]").length}`,
                `ledgerPending=${document.querySelectorAll("[data-financials-ledger-hydrating]").length > 0}`,
            ].join(" ");
            if (sig !== last) { last = sig; w.__film!.push(`+${Math.round(performance.now() - t0)}ms ${sig}`); }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        performance.mark("qa-click-armed");
    });
    const t0 = Date.now();
    await page.locator('[data-financials-nav="details"]').first().click({ timeout: 20_000 });
    await page.locator('[data-financials-overlay="detail"]').waitFor({ state: "visible", timeout: 120_000 });
    await page.waitForFunction(() => document.querySelectorAll("[data-financials-ledger-row]").length > 10, undefined, { timeout: 120_000 });
    const ms = Date.now() - t0;
    const film = await page.evaluate(() => (window as unknown as { __film: string[] }).__film ?? []);
    const net = await page.evaluate(() => performance.getEntriesByType("resource")
        .filter((e) => e.name.includes("/api/admin/financials/card"))
        .slice(-1)
        .map((e) => ({ duration: Math.round(e.duration), transfer: Math.round((e as PerformanceResourceTiming).transferSize ?? 0) }))[0] ?? null);
    log(`${label}_CLICK_TO_COMPLETE_MS ${ms}`);
    log(`${label}_CARD_REQUEST ` + JSON.stringify(net));
    log(`${label}_FILMSTRIP\n` + film.join("\n"));
    return ms;
}

test("click to complete Details", async ({ page }) => {
    await page.goto(`${LANE}?subject_id=${SUBJECT}`);
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-financials-card="true"]').first().waitFor({ state: "visible", timeout: 180_000 });
    await page.waitForTimeout(9_000);
    await clickToComplete(page, "DETAILS");
    await page.screenshot({ path: `${OUT}/pol-details-complete.png` });
});
