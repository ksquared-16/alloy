/**
 * P0-7.6 PART 5 — WHERE THE NON-SERVER TIME ACTUALLY GOES, AT THE BYTE LEVEL.
 *
 * `clientWallMs` in the prototype probe is measured around `await fetch(...)`, which resolves at
 * RESPONSE HEADERS. The server's own instrumented span (`outerWallMs`) is ~900ms while that wall is
 * ~2876ms. A ~1976ms difference must not be called "network" without evidence, so this reads the
 * PerformanceResourceTiming entry for the very same request and reports each phase separately.
 */
import { expect, test } from "@playwright/test";

test("p076 wire breakdown", async ({ page }) => {
    const member = process.env.P076_MEMBER_ID!;
    const customer = process.env.P076_CUSTOMER_ID!;
    const cards = process.env.P076_CARDS ?? "";
    expect(member, "P076_MEMBER_ID is required").toBeTruthy();

    test.setTimeout(180_000);
    await page.goto(process.env.P076_URL || "/adminV2/workspace/work-unit/new-leads",
        { waitUntil: "domcontentloaded", timeout: 120_000 });
    // Same gate the sampler uses: the operator's frame must exist before the probe request.
    await page.waitForSelector("article.alloy-os-ucard[data-universal-card-key]", { timeout: 60_000 });

    const out = await page.evaluate(async ([mid, cid, cardList]) => {
        const KPI = "ops.needs_attention_count,ops.work_overdue_count,enrollment.lead_count";
        const VIEWS = "new_leads,new_work_view_2,new_work_view_3,new_work_view_4,new_work_view_5,new_work_view_6,new_work_view_7";
        const url = `/api/admin/p076-first-order-prototype?member_id=${mid}&customer_id=${cid}`
            + (cardList ? `&cards=${encodeURIComponent(cardList)}` : "")
            + `&kpi_keys=${encodeURIComponent(KPI)}&view_ids=${encodeURIComponent(VIEWS)}`;
        performance.clearResourceTimings();
        const t0 = performance.now();
        const res = await fetch(url, { credentials: "include" });
        const atHeaders = performance.now() - t0;
        const text = await res.text();
        const atBody = performance.now() - t0;
        const parsed = JSON.parse(text);
        const atParsed = performance.now() - t0;

        const e = performance
            .getEntriesByType("resource")
            .find((r) => r.name.includes("p076-first-order-prototype")) as PerformanceResourceTiming | undefined;

        return {
            bytes: text.length,
            encodedBodySize: e?.encodedBodySize ?? null,
            decodedBodySize: e?.decodedBodySize ?? null,
            atHeadersMs: Math.round(atHeaders),
            atBodyMs: Math.round(atBody),
            atParsedMs: Math.round(atParsed),
            // Resource Timing phases, all relative to the entry's own startTime.
            redirectMs: e ? Math.round(e.redirectEnd - e.redirectStart) : null,
            dnsMs: e ? Math.round(e.domainLookupEnd - e.domainLookupStart) : null,
            connectMs: e ? Math.round(e.connectEnd - e.connectStart) : null,
            tlsMs: e && e.secureConnectionStart ? Math.round(e.connectEnd - e.secureConnectionStart) : null,
            /** Request sent -> first byte of the response. This is the server + edge wall. */
            ttfbMs: e ? Math.round(e.responseStart - e.requestStart) : null,
            /** First byte -> last byte. This is the only term that is genuinely transfer. */
            downloadMs: e ? Math.round(e.responseEnd - e.responseStart) : null,
            /** Queued/stalled before the request went out (connection pool, priority). */
            stalledMs: e ? Math.round(e.requestStart - e.startTime) : null,
            durationMs: e ? Math.round(e.duration) : null,
            serverOuterWallMs: parsed?.shadow?.outerWallMs ?? null,
            serverReadDagMs: parsed?.shadow?.timing?.readDagMs ?? null,
            note: parsed?.note ?? null,
        };
    }, [member, customer, cards]);

    console.log(`[wire] ${JSON.stringify(out)}`);
});
