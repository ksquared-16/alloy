import { test } from "@playwright/test";

/**
 * D0-D9 — THE ANSWER ROW'S OWN TIMELINE (P0-7.6 Parts 8/9).
 *
 * Whole-document bandwidth is the wrong unit: the first-order answer is ONE ~85.6 KB Flight row and
 * the client can apply NOTHING from a partial value of it. What matters is when that row starts,
 * when it completes, and what happens on either side.
 *
 * BYTE-LEVEL, not script insertion. A previous slice timestamped script ELEMENTS and reported a
 * ~600 ms "response-close latency" that did not exist; only reading the body as bytes refuted it.
 * Here the body is read from a streaming reader and every boundary is a byte offset with a clock.
 *
 * Boundaries that are NOT externally observable are reported as such rather than approximated:
 * D1 (serialization begins) and D3 (row handed to the stream) are inside React's renderer and have
 * no client-visible signal. D2 is bounded above by D4.
 */
test("p076 answer row boundaries", async ({ page }) => {
    const target = process.env.P076_URL || "/adminV2/workspace/work-unit/new-leads";
    await page.goto("/adminV2/workspace", { waitUntil: "domcontentloaded" });

    const out = await page.evaluate(async (url) => {
        const t0 = performance.now();
        const res = await fetch(url, { credentials: "include" });
        const headers = performance.now();
        const reader = res.body!.getReader();
        const dec = new TextDecoder();

        let text = "";
        let firstByte: number | null = null;
        let answerFirst: number | null = null;   // D4 — first byte of the answer row
        let answerLast: number | null = null;    // D5 — last byte of the answer row
        let answerStartOffset = -1;
        let prevChunkAt: number | null = null;
        let maxGap = 0;
        let maxGapAt = -1;
        let chunks = 0;

        // The answer row is the flight row carrying the seed component's props. Find it by its
        // row prefix, then close it on the row terminator (a newline followed by a new row id).
        const ROW_RE = /\n(?=[0-9a-f]{1,4}:)/g;

        for (;;) {
            const { done, value } = await reader.read();
            const now = performance.now();
            if (done) break;
            chunks += 1;
            if (firstByte === null) firstByte = now;
            if (prevChunkAt !== null) {
                const gap = now - prevChunkAt;
                if (gap > maxGap) { maxGap = gap; maxGapAt = text.length; }
            }
            prevChunkAt = now;

            const before = text.length;
            text += dec.decode(value, { stream: true });

            if (answerStartOffset < 0) {
                const at = text.indexOf("workViewTotalsSeed");
                if (at >= 0) {
                    // Walk back to the start of the flight row that contains it.
                    const rowStart = text.lastIndexOf("\n", at);
                    answerStartOffset = rowStart >= 0 ? rowStart + 1 : 0;
                    // The row began in THIS chunk only if its start is at/after the previous end.
                    answerFirst = answerStartOffset >= before ? now : null;
                    if (answerFirst === null) answerFirst = now; // it arrived by now at the latest
                }
            }
            if (answerStartOffset >= 0 && answerLast === null) {
                ROW_RE.lastIndex = answerStartOffset + 1;
                const m = ROW_RE.exec(text);
                if (m) answerLast = now;
            }
        }
        const bodyEnd = performance.now();           // D6
        if (answerLast === null) answerLast = bodyEnd;

        // Row extent in bytes.
        let rowBytes: number | null = null;
        if (answerStartOffset >= 0) {
            ROW_RE.lastIndex = answerStartOffset + 1;
            const m = ROW_RE.exec(text);
            const end = m ? m.index : text.length;
            rowBytes = new TextEncoder().encode(text.slice(answerStartOffset, end)).length;
        }

        return {
            headersMs: Math.round(headers - t0),
            firstByteMs: firstByte === null ? null : Math.round(firstByte - t0),
            answerFirstMs: answerFirst === null ? null : Math.round(answerFirst - t0),   // D4
            answerLastMs: Math.round(answerLast - t0),                                    // D5
            bodyEndMs: Math.round(bodyEnd - t0),                                          // D6
            emptyTailMs: Math.round(bodyEnd - answerLast),
            answerRowBytes: rowBytes,
            totalBytes: new TextEncoder().encode(text).length,
            chunks,
            maxMidStreamGapMs: Math.round(maxGap),
            maxGapAtByte: maxGapAt,
        };
    }, target);
    console.log(`[rows] ${JSON.stringify(out)}`);
});
