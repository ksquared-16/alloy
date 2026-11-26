import { test } from "@playwright/test";

/**
 * WHERE DO THE ~1,817ms OF DELIVERY/MATERIALIZATION GO?
 *
 * The certification model failed on this term, not on the first-order projection: the server
 * composes the layout in 169ms P50 while the document reaches DOMContentLoaded at 1,986ms P50.
 * Something between those two owns nearly two seconds, and "delivery" is a label, not a diagnosis.
 *
 * This decomposes the navigation with the browser's own Navigation Timing Level 2 entry, which
 * attributes the wall to phases that have different owners:
 *
 *   redirect / dns / tcp / tls   → connection setup (cold edge, no keep-alive)
 *   requestStart → responseStart → TTFB: the server thinking, INCLUDING cold start
 *   responseStart → responseEnd  → streaming the document body down
 *   responseEnd → domInteractive → parsing and executing what arrived
 *   domInteractive → DCL         → deferred scripts and DCL handlers
 *
 * A model that cannot say which of these owns the time cannot say whether the target is reachable,
 * and this run exists to stop guessing at it.
 */
test("p076 delivery decomposition", async ({ page }) => {
    test.setTimeout(180_000);
    const url = process.env.P076_URL || "/adminV2/workspace/work-unit/new-leads";

    // Warm the app shell first, then measure the SECOND navigation — the same discipline the
    // critical-path spec uses, so this is comparable to the term it is decomposing.
    await page.goto("/adminV2/workspace", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(1500);

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });

    const out = await page.evaluate(() => {
        const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
        // `getEntriesByType` is typed as PerformanceEntry[]; the resource fields live on the
        // narrower PerformanceResourceTiming, so the cast is the narrowing, not a suppression.
        const doc = (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
            .filter((r) => r.initiatorType === "fetch" || r.initiatorType === "xmlhttprequest").length;
        const ph = (a: number, b: number) => Math.round(Math.max(0, b - a));
        return {
            transferSize: n.transferSize,
            encodedBodySize: n.encodedBodySize,
            decodedBodySize: n.decodedBodySize,
            phases: {
                redirect: ph(n.redirectStart, n.redirectEnd),
                dns: ph(n.domainLookupStart, n.domainLookupEnd),
                tcp: ph(n.connectStart, n.connectEnd),
                tls: n.secureConnectionStart ? ph(n.secureConnectionStart, n.connectEnd) : 0,
                ttfb_request_to_first_byte: ph(n.requestStart, n.responseStart),
                response_download: ph(n.responseStart, n.responseEnd),
                parse_to_interactive: ph(n.responseEnd, n.domInteractive),
                interactive_to_dcl: ph(n.domInteractive, n.domContentLoadedEventEnd),
                dcl_to_load: ph(n.domContentLoadedEventEnd, n.loadEventEnd),
            },
            totals: {
                startToResponseStart: Math.round(n.responseStart),
                startToResponseEnd: Math.round(n.responseEnd),
                domInteractive: Math.round(n.domInteractive),
                domContentLoaded: Math.round(n.domContentLoadedEventEnd),
            },
            serverTiming: (n.serverTiming ?? []).map((s) => ({ name: s.name, dur: s.duration })),
            xhrCount: doc,
        };
    });
    console.log(`[delivery] ${JSON.stringify(out)}`);
});
