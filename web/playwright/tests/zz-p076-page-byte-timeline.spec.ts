/**
 * P0-7.6 PHASES 3–5 — THE REAL OPERATOR PAGE, BYTE BY BYTE, IN ONE CLOCK DOMAIN.
 *
 * Every earlier attempt in this programme compared timestamps made by different probes and inferred
 * the gap between them. That is how a subtraction bucket once became an "807ms delivery floor" that
 * byte-level measurement then refuted. This probe refuses that shape.
 *
 * ── THE CLOCK CONTRACT (Phase 3) ────────────────────────────────────────────────────────────────
 *
 * ONE origin: `performance.now()` inside the page, whose zero is navigationStart. Every browser
 * number here is on it.
 *
 * The SERVER's numbers arrive on a different clock, so they are never converted by assumption.
 * Two facts make them comparable:
 *
 *   1. SELF-CORRELATION. `#__alloy_route_timing` is rendered INTO the very response being read, by
 *      the page segment. So its marks belong to THIS response by construction — there is no
 *      identifier to mint, and nothing to join on. A navigation trace id would add a new
 *      identifier without adding a fact.
 *
 *   2. EXPLICIT SKEW. The server also emits two wall-clock epochs. `serverEpochSkewMs` reports
 *      `layout_entry_epoch_ms - (timeOrigin + requestSentAt)` — what the server's clock says minus
 *      what ours says about the same instant, network included. It is REPORTED, never silently
 *      subtracted, so a reader can see whether cross-clock intervals are trustworthy at all.
 *
 * Intervals are only ever formed between endpoints on the SAME clock. Cross-clock quantities are
 * published as raw endpoints plus the measured skew, and left for the reader to judge.
 *
 * ── WHAT IS MEASURED (Phase 5) ──────────────────────────────────────────────────────────────────
 *
 * A streaming reader over the real page response. Not script insertion, which would time when the
 * browser chose to run a tag rather than when the bytes arrived.
 */
import { expect, test } from "@playwright/test";

const URL_PATH = process.env.P076_URL || "/adminV2/workspace/work-unit/new-leads";

test("p076 real page byte timeline", async ({ page }) => {
    test.setTimeout(180_000);

    // Establish the session on the real origin first; the probe below reads a SECOND response so
    // that chunk arrival can be observed, which a navigation does not expose.
    await page.goto(URL_PATH, { waitUntil: "domcontentloaded", timeout: 120_000 });
    // P076_SKIP_WAIT exists to exercise the streaming mechanics against any reachable response
    // (a sign-in page will do). It must never be set for a real sample: without the operator's
    // frame there is no first-order payload to find, and a run that measured one would be lying.
    if (process.env.P076_SKIP_WAIT !== "1") {
        await page.waitForSelector("article.alloy-os-ucard[data-universal-card-key]", { timeout: 60_000 });
    }

    const out = await page.evaluate(async (path) => {
        /** Markers whose FIRST byte is the thing we care about, in stream order. */
        const MARKERS: Array<[string, string]> = [
            ["html_open", "<html"],
            ["head_close", "</head>"],
            ["body_open", "<body"],
            ["first_card_key", "data-universal-card-key"],
            ["focus_panel_region", "data-inline-focus-panel-resolved"],
            ["route_timing_seed", "__alloy_route_timing"],
        ];

        const t0 = performance.now();
        const res = await fetch(path, {
            credentials: "include",
            headers: { accept: "text/html,application/xhtml+xml" },
            cache: "no-store",
        });
        const headersAt = performance.now() - t0;

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        const chunks: Array<{ at: number; bytes: number; cumulative: number }> = [];
        const markerAt: Record<string, number | null> = {};
        for (const [name] of MARKERS) markerAt[name] = null;

        let text = "";
        let cumulative = 0;
        let firstByteAt: number | null = null;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            const at = performance.now() - t0;
            if (firstByteAt == null) firstByteAt = at;
            cumulative += value.byteLength;
            chunks.push({ at: Math.round(at), bytes: value.byteLength, cumulative });
            const before = text.length;
            text += decoder.decode(value, { stream: true });
            // A marker is attributed to the chunk in which its first byte ARRIVED. Searching from
            // slightly before the join keeps a marker split across a chunk boundary from being lost.
            for (const [name, needle] of MARKERS) {
                if (markerAt[name] != null) continue;
                if (text.indexOf(needle, Math.max(0, before - needle.length)) !== -1) {
                    markerAt[name] = Math.round(at);
                }
            }
        }
        const bodyEndAt = performance.now() - t0;

        // The server's own marks, carried by THIS response.
        let serverMarks: Record<string, unknown> | null = null;
        const m = text.match(/id="__alloy_route_timing"[^>]*>([\s\S]*?)<\/script>/);
        if (m) { try { serverMarks = JSON.parse(m[1]); } catch { serverMarks = null; } }

        // Resource Timing for the same request, on the page's clock.
        const entry = performance
            .getEntriesByType("resource")
            .filter((r) => r.name.includes(path))
            .pop() as PerformanceResourceTiming | undefined;

        const requestSentAt = entry ? entry.requestStart : null;
        const layoutEpoch = serverMarks ? (serverMarks.layout_entry_epoch_ms as number | undefined) : undefined;

        return {
            url: path,
            totalBytes: cumulative,
            chunkCount: chunks.length,
            chunks: chunks.slice(0, 40),
            headersAtMs: Math.round(headersAt),
            firstByteAtMs: firstByteAt == null ? null : Math.round(firstByteAt),
            bodyEndAtMs: Math.round(bodyEndAt),
            markerAtMs: markerAt,
            resourceTiming: entry
                ? {
                      startTime: Math.round(entry.startTime),
                      requestStart: Math.round(entry.requestStart),
                      responseStart: Math.round(entry.responseStart),
                      responseEnd: Math.round(entry.responseEnd),
                      ttfbMs: Math.round(entry.responseStart - entry.requestStart),
                      downloadMs: Math.round(entry.responseEnd - entry.responseStart),
                      encodedBodySize: entry.encodedBodySize,
                      decodedBodySize: entry.decodedBodySize,
                  }
                : null,
            serverMarks,
            /*
             * REPORTED, NEVER SUBTRACTED. Large magnitude means the two clocks disagree and no
             * cross-clock interval in this sample may be believed.
             */
            serverEpochSkewMs:
                layoutEpoch != null && requestSentAt != null
                    ? Math.round(layoutEpoch - (performance.timeOrigin + requestSentAt))
                    : null,
            timeOrigin: Math.round(performance.timeOrigin),
        };
    }, URL_PATH);

    console.log(`[bytes] ${JSON.stringify(out)}`);
    expect(out.totalBytes, "the probe must actually have read a body").toBeGreaterThan(0);
});
