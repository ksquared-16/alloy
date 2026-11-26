/**
 * WHAT IS THE ~1,280ms THAT IS NOT COMPOSITION?
 *
 * The document measures 2,022ms server-side (`page_total_ms`) of which only 742ms is composition.
 * The remaining ~1,280ms has been attributed loosely to "route, RSC serialisation, transport and
 * parse" — which is four different things with four different remedies. Streaming a partial
 * document helps a serialisation-bound leg a great deal and a network-bound leg very little, so
 * the split decides whether the architecture work is worth building.
 *
 * Navigation Timing separates them without instrumenting the server:
 *   requestStart -> responseStart   server think time + network round trip (TTFB)
 *   responseStart -> responseEnd    streaming/transfer of the document body
 *   responseEnd -> domInteractive   HTML/RSC parse
 *   domInteractive -> DCL           script evaluation before content is interactive
 */
import { test } from "@playwright/test";

test("navigation timing decomposition", async ({ page }) => {
    await page.goto(process.env.P076_URL || "/adminV2/workspace/work-unit/new-leads", {
        waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(Number(process.env.P076_SETTLE_MS || 6000));

    const t = await page.evaluate(() => {
        const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        if (!n) return null;
        const serverMark = (window as unknown as { __p076marks?: { page_total_ms?: number } }).__p076marks?.page_total_ms ?? null;
        return {
            redirect: Math.round(n.redirectEnd - n.redirectStart),
            dns: Math.round(n.domainLookupEnd - n.domainLookupStart),
            tcp: Math.round(n.connectEnd - n.connectStart),
            tls: n.secureConnectionStart ? Math.round(n.connectEnd - n.secureConnectionStart) : 0,
            ttfb: Math.round(n.responseStart - n.requestStart),
            transfer: Math.round(n.responseEnd - n.responseStart),
            parse: Math.round(n.domInteractive - n.responseEnd),
            scriptToDcl: Math.round(n.domContentLoadedEventEnd - n.domInteractive),
            dcl: Math.round(n.domContentLoadedEventEnd),
            encodedSize: n.encodedBodySize,
            decodedSize: n.decodedBodySize,
            serverMark,
        };
    });
    console.log(`[nav] ${JSON.stringify(t)}`);
});
