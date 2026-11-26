import { test } from "@playwright/test";

/**
 * WHAT IS THE 526 ms BETWEEN page_total AND documentMs?
 *
 * `page_total` is the server PAGE SEGMENT's own wall; `documentMs` is navigation start to
 * DOMContentLoaded. The 526 ms between them is currently one bucket, and Part 14 forbids a generic
 * transport bucket when its internals are measurable. They are: PerformanceNavigationTiming splits
 * the browser's half, and the middleware's own headers carry the server work that happens BEFORE
 * the page segment starts and is therefore invisible to page_total.
 *
 * The specific question: is the residue server-side (pre-page middleware/boot) or client-side
 * (parse)? Those want opposite repairs, and a single 526 ms number cannot tell them apart.
 */
test("p076 document interval", async ({ page }) => {
    const url = process.env.P076_URL || "/adminV2/workspace/work-unit/new-leads";

    let mwT0: string | null = null;
    let mwAuth: string | null = null;
    page.on("response", (r) => {
        if (r.request().isNavigationRequest() && r.url().includes(url)) {
            mwT0 = r.headers()["x-alloy-mw-t0"] ?? null;
            mwAuth = r.headers()["x-alloy-mw-auth-ms"] ?? null;
        }
    });

    const nav0 = Date.now();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
    const domMs = Date.now() - nav0;

    const out = await page.evaluate(() => {
        const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        if (!n) return null;
        const el = document.getElementById("__alloy_route_timing");
        let marks: Record<string, unknown> | null = null;
        try { marks = el?.textContent ? JSON.parse(el.textContent) : null; } catch { marks = null; }
        return {
            // Browser-side split of the navigation.
            startToRequest: Math.round(n.requestStart - n.startTime),
            ttfb: Math.round(n.responseStart - n.requestStart),
            streaming: Math.round(n.responseEnd - n.responseStart),
            responseEndToDcl: Math.round(n.domContentLoadedEventEnd - n.responseEnd),
            domInteractive: Math.round(n.domInteractive - n.startTime),
            dcl: Math.round(n.domContentLoadedEventEnd - n.startTime),
            transferSize: n.transferSize,
            encodedBodySize: n.encodedBodySize,
            decodedBodySize: n.decodedBodySize,
            pageTotal: (marks as { page_total_ms?: number } | null)?.page_total_ms ?? null,
            pageEntryEpoch: (marks as { page_entry_epoch_ms?: number } | null)?.page_entry_epoch_ms ?? null,
        };
    });
    console.log(`[docint] ${JSON.stringify({ ...out, domMs, mwT0, mwAuth })}`);
});
